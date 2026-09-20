import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("organizations_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
  index("organizations_slug_trgm_idx").using("gin", table.slug.op("gin_trgm_ops")),
]);