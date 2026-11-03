import { z } from "zod";
export const SignUpSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),
  password: z
    .string({ error: "Password is required" })
    .trim()
    .min(8, "Password must be at least 8 characters"),
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty"),
});

export const LoginAuthSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .min(1, "Email is required"),
  password: z
    .string({ error: "Password is required" })
    .trim()
    .min(8, "Password must be at least 8 characters"),
});
