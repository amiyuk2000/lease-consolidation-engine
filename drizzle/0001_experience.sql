ALTER TABLE "portfolios" ADD COLUMN "experience_standards" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "workstations" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "focus_rooms" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "confidential_rooms" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "collaboration_spaces" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "social_spaces" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "quietest_attendance_pct" numeric(7, 3);