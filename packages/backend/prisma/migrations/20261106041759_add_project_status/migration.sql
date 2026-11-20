-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_projects" ("created_at", "created_by", "description", "icon", "id", "name", "updated_at", "updated_by") SELECT "created_at", "created_by", "description", "icon", "id", "name", "updated_at", "updated_by" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");
CREATE INDEX "projects_status_idx" ON "projects"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
