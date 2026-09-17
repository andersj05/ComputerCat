import { z } from "zod";

export const sendRequestSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(6000),
});
