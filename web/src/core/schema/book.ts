// ブックとページのデータの形
import { z } from "zod";

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
});

export const BookSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  pages: z.array(PageSchema).min(1),
});

export type Page = z.infer<typeof PageSchema>;
export type Book = z.infer<typeof BookSchema>;
