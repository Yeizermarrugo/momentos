CREATE TYPE "public"."category" AS ENUM('romantica', 'divertida', 'general');--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('love', 'fun');--> statement-breakpoint
CREATE TYPE "public"."winner_category" AS ENUM('romantica', 'divertida');--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_code" text NOT NULL,
	"seat_index" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"table_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_code_seat_unique" UNIQUE("invitation_code","seat_index")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"s3_key" text NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"guest_id" integer NOT NULL,
	"category" "category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"photo_id" integer NOT NULL,
	"guest_id" integer NOT NULL,
	"type" "reaction_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_photo_guest_unique" UNIQUE("photo_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "winner_category" NOT NULL,
	"photo_id" integer NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "winners_category_unique" UNIQUE("category")
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winners" ADD CONSTRAINT "winners_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;