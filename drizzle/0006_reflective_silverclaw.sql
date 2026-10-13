CREATE TABLE "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"guest_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "share_code" text;--> statement-breakpoint
UPDATE "photos" SET "share_code" = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 12) WHERE "share_code" IS NULL;--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "share_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_share_code_unique" UNIQUE("share_code");