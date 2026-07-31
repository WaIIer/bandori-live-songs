import { z } from "zod";

export const publicApiDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const publicApiSongCategorySchema = z.enum([
  "original",
  "cover",
  "project-common",
]);
export const publicApiSetlistStatusSchema = z.enum([
  "missing",
  "partial",
  "complete",
]);

export const publicApiBandSchema = z.object({
  slug: z.string(),
  nameJa: z.string(),
  nameEn: z.string(),
  displayOrder: z.number().int(),
  groupType: z.enum(["band", "project-common"]),
  supportColor: z.string().nullable(),
  eventernoteActorId: z.number().int().positive().nullable(),
  musicbrainzArtistMbid: z.string().uuid().nullable(),
});

export const publicApiSongSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  category: publicApiSongCategorySchema,
  bandSlug: z.string().nullable(),
  firstReleaseDate: publicApiDateSchema.nullable(),
  hasBeenPlayedLive: z.boolean(),
});

export const publicApiEventSummarySchema = z.object({
  eventernoteEventId: z.number().int().positive(),
  title: z.string(),
  eventDate: publicApiDateSchema,
  venue: z.string().nullable(),
  performingBandSlugs: z.array(z.string()),
  setlistStatus: publicApiSetlistStatusSchema,
  sourceUrl: z.string().url(),
});

export const publicApiSetlistEntrySchema = z.object({
  position: z.number().int().positive(),
  title: z.string(),
  song: publicApiSongSchema.nullable(),
});

export const publicApiEventDetailSchema =
  publicApiEventSummarySchema.extend({
    setlist: z.array(publicApiSetlistEntrySchema),
  });

export const publicApiPaginationSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
});

export const publicApiProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
});

export type PublicApiBand = z.infer<typeof publicApiBandSchema>;
export type PublicApiSong = z.infer<typeof publicApiSongSchema>;
export type PublicApiEventSummary = z.infer<
  typeof publicApiEventSummarySchema
>;
export type PublicApiEventDetail = z.infer<
  typeof publicApiEventDetailSchema
>;

