import { z } from "zod";

export const invitationCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Please provide a valid email address.")
    .toLowerCase(),
  role: z.enum(["ANALYST", "VIEWER"], {
    message: "Invitations are restricted to ANALYST and VIEWER roles.",
  }),
});

export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(10, "A valid invitation token is required."),
  name: z.string().trim().min(1, "Name must not be empty.").max(100).optional(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(100).optional(),
});

export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;
export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;
