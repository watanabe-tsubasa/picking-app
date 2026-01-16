import { db, stores, workers } from "./index";

async function seed() {
  console.log("Seeding database...");

  // Insert sample stores
  await db.insert(stores).values([
    { store_name: "本店" },
    { store_name: "駅前店" },
    { store_name: "郊外店" },
  ]);

  // Insert sample workers
  await db.insert(workers).values([
    { worker_name: "田中" },
    { worker_name: "佐藤" },
    { worker_name: "鈴木" },
  ]);

  console.log("Seed completed!");
}

seed().catch(console.error);
