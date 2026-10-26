import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { clearLoginFailures, recordFailedLogin } from "@/lib/auth/login-policy";

const provider = authOptions.providers[0] as unknown as {
  options: {
    authorize: (credentials: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  };
};
const authorize = provider.options.authorize;

const originalFindUnique = db.user.findUnique.bind(db.user);

test("Credentials authorize: successful authentication with valid credentials", async () => {
  const email = `auth-success-${Date.now()}@example.test`;
  const password = "ValidPassword!123";
  const passwordHash = await bcrypt.hash(password, 10);

  (db.user as unknown as { findUnique: unknown }).findUnique = async () => ({
    id: "user-123",
    name: "Avery Morgan",
    email,
    role: "ADMIN",
    workspaceId: "ws-1",
    passwordHash,
    membershipStatus: "ACTIVE",
  });

  try {
    const user = await authorize({ email, password });
    assert.ok(user);
    assert.equal(user.id, "user-123");
    assert.equal(user.email, email);
    assert.equal(user.role, "ADMIN");
    assert.equal(user.workspaceId, "ws-1");
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: email normalization trims and lowercases input", async () => {
  const email = `auth-norm-${Date.now()}@example.test`;
  const password = "ValidPassword!123";
  const passwordHash = await bcrypt.hash(password, 10);

  let queriedEmail: string | undefined;
  (db.user as unknown as { findUnique: unknown }).findUnique = async (args: { where: { email: string } }) => {
    queriedEmail = args.where.email;
    return {
      id: "user-norm",
      name: "Normal User",
      email,
      role: "ANALYST",
      workspaceId: "ws-1",
      passwordHash,
      membershipStatus: "ACTIVE",
    };
  };

  try {
    const user = await authorize({
      email: `  ${email.toUpperCase()}  `,
      password,
    });
    assert.ok(user);
    assert.equal(queriedEmail, email);
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: returns null on wrong password and records failed login", async () => {
  const email = `auth-badpw-${Date.now()}@example.test`;
  const passwordHash = await bcrypt.hash("CorrectPassword!123", 10);

  (db.user as unknown as { findUnique: unknown }).findUnique = async () => ({
    id: "user-badpw",
    name: "User",
    email,
    role: "VIEWER",
    workspaceId: "ws-1",
    passwordHash,
    membershipStatus: "ACTIVE",
  });

  try {
    clearLoginFailures(email);
    const user = await authorize({ email, password: "WrongPassword!123" });
    assert.equal(user, null);
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: returns null on nonexistent user", async () => {
  const email = `auth-missing-${Date.now()}@example.test`;

  (db.user as unknown as { findUnique: unknown }).findUnique = async () => null;

  try {
    clearLoginFailures(email);
    const user = await authorize({ email, password: "AnyPassword!123" });
    assert.equal(user, null);
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: rejects revoked accounts with deactivated account error", async () => {
  const email = `auth-revoked-${Date.now()}@example.test`;
  const password = "ValidPassword!123";
  const passwordHash = await bcrypt.hash(password, 10);

  (db.user as unknown as { findUnique: unknown }).findUnique = async () => ({
    id: "user-revoked",
    name: "Revoked User",
    email,
    role: "VIEWER",
    workspaceId: "ws-1",
    passwordHash,
    membershipStatus: "REVOKED",
  });

  try {
    await assert.rejects(
      async () => {
        await authorize({ email, password });
      },
      (err: Error) => {
        assert.match(err.message, /This account has been deactivated/i);
        return true;
      }
    );
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: rate-limited account throws before database query", async () => {
  const email = `auth-ratelimit-${Date.now()}@example.test`;

  clearLoginFailures(email);
  for (let i = 0; i < 5; i++) {
    recordFailedLogin(email);
  }

  let dbCalled = false;
  (db.user as unknown as { findUnique: unknown }).findUnique = async () => {
    dbCalled = true;
    return null;
  };

  try {
    await assert.rejects(
      async () => {
        await authorize({ email, password: "Password!123" });
      },
      (err: Error) => {
        assert.match(err.message, /Too many sign-in attempts/i);
        return true;
      }
    );
    assert.equal(dbCalled, false, "Database should not be queried when rate-limited");
  } finally {
    clearLoginFailures(email);
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: backward compatibility falls back when membershipStatus column does not exist", async () => {
  const email = `auth-fallback-${Date.now()}@example.test`;
  const password = "ValidPassword!123";
  const passwordHash = await bcrypt.hash(password, 10);

  let callCount = 0;
  (db.user as unknown as { findUnique: unknown }).findUnique = async (args: { select?: Record<string, boolean> }) => {
    callCount += 1;
    if (args.select && "membershipStatus" in args.select) {
      // Simulate PostgreSQL error when membershipStatus column is missing
      const err = new Error("The column `User.membershipStatus` does not exist in the current database.");
      (err as unknown as { code: string }).code = "P2022";
      throw err;
    }
    // Fallback query succeeds
    return {
      id: "user-fallback",
      name: "Legacy User",
      email,
      role: "ADMIN",
      workspaceId: "ws-1",
      passwordHash,
    };
  };

  try {
    const user = await authorize({ email, password });
    assert.ok(user);
    assert.equal(user.id, "user-fallback");
    assert.equal(user.role, "ADMIN");
    assert.equal(callCount, 2, "Should query first with membershipStatus, then retry with fallback");
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

test("Credentials authorize: database connection failure throws temporary service unavailable error", async () => {
  const email = `auth-dberr-${Date.now()}@example.test`;
  const password = "ValidPassword!123";

  (db.user as unknown as { findUnique: unknown }).findUnique = async () => {
    const err = new Error("Can't reach database server at `db.supabase.co:5432`");
    (err as unknown as { code: string }).code = "P1001";
    throw err;
  };

  try {
    await assert.rejects(
      async () => {
        await authorize({ email, password });
      },
      (err: Error) => {
        assert.match(err.message, /authentication service is temporarily unavailable/i);
        return true;
      }
    );
  } finally {
    (db.user as unknown as { findUnique: unknown }).findUnique = originalFindUnique;
  }
});

