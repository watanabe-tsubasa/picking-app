import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  store_name: text("store_name").notNull(),
});

export const workers = sqliteTable("workers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worker_name: text("worker_name").notNull(),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  store_id: integer("store_id")
    .notNull()
    .references(() => stores.id),
  worker_id: integer("worker_id")
    .notNull()
    .references(() => workers.id),
  order_number: text("order_number").notNull(), // "A" + 7 digits
  start_time: text("start_time").notNull(), // ISO timestamp
  end_time: text("end_time"), // ISO timestamp, null if not completed
  is_completed: integer("is_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  work_date: text("work_date").notNull(), // "YYYY-MM-DD" JST-based
});

export const eachPicks = sqliteTable("each_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  order_id: integer("order_id")
    .notNull()
    .references(() => orders.id),
  worker_id: integer("worker_id")
    .notNull()
    .references(() => workers.id),
  sku_count: integer("sku_count").notNull(), // >= 1
  move_start: text("move_start"),
  arrive_at_shelf: text("arrive_at_shelf"),
  pick_start: text("pick_start"),
  pack_start: text("pack_start"),
  pack_finished: text("pack_finished"),
  customer_service_start: text("customer_service_start"),
  customer_service_finish: text("customer_service_finish"),
});

// Type exports for use in loaders/actions
export type Store = typeof stores.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type EachPick = typeof eachPicks.$inferSelect;
