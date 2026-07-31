CREATE TYPE "public"."song_category" AS ENUM('original', 'cover', 'project-common');--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "band_slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "first_release_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "setlist_entries" ADD COLUMN "song_id" integer;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "category" "song_category" DEFAULT 'original' NOT NULL;--> statement-breakpoint
UPDATE "songs"
SET "category" = 'project-common', "band_slug" = NULL
WHERE "band_slug" = 'project-common';--> statement-breakpoint
UPDATE "setlist_entries" AS "entry"
SET "song_id" = "song"."id"
FROM "songs" AS "song"
WHERE "entry"."raw_title" = "song"."title";--> statement-breakpoint
ALTER TABLE "setlist_entries" ADD CONSTRAINT "setlist_entries_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setlist_entries_song_id_idx" ON "setlist_entries" USING btree ("song_id");--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_category_fields_check" CHECK ((
        ("songs"."category" = 'original' AND "songs"."band_slug" IS NOT NULL AND "songs"."first_release_date" IS NOT NULL)
        OR
        ("songs"."category" IN ('cover', 'project-common') AND "songs"."band_slug" IS NULL)
      ));
