-- Correo pasa a ser el usuario del login → único. Antes se permitía repetir
-- (pareja compartiendo correo): se deja el correo en la fila más vieja y se
-- limpia en las demás (pueden volver a vincular uno propio desde "Crear
-- cuenta" con su código + contraseña actual).
UPDATE "guests" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;--> statement-breakpoint
UPDATE "guests" g SET "email" = NULL
WHERE "email" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "guests" o WHERE o."email" = g."email" AND o."id" < g."id");--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_email_unique" UNIQUE("email");
