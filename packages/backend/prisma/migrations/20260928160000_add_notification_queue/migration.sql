-- CreateTable
CREATE TABLE "notification_queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notification_queue_user_id_is_read_idx" ON "notification_queue"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notification_queue_created_at_idx" ON "notification_queue"("created_at");
