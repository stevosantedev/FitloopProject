import { prisma } from "../src/prisma.js";

const exercises = [
  ["Push-up", "Chest", "Bodyweight"],
  ["Bench press", "Chest", "Barbell"],
  ["Incline dumbbell press", "Chest", "Dumbbell"],
  ["Overhead press", "Shoulders", "Barbell"],
  ["Lateral raise", "Shoulders", "Dumbbell"],
  ["Pull-up", "Back", "Bodyweight"],
  ["Lat pulldown", "Back", "Cable"],
  ["Seated row", "Back", "Cable"],
  ["Biceps curl", "Arms", "Dumbbell"],
  ["Triceps pushdown", "Arms", "Cable"],
  ["Squat", "Legs", "Barbell"],
  ["Romanian deadlift", "Legs", "Barbell"],
  ["Lunge", "Legs", "Bodyweight"],
  ["Plank", "Core", "Bodyweight"]
];

async function seedExercises() {
  // The schema does not enforce unique exercise names, so check before inserting to keep reruns safe.
  for (const [name, muscleGroup, equipment] of exercises) {
    const existing = await prisma.exercise.findFirst({ where: { name, isCustom: false } });
    if (!existing) {
      await prisma.exercise.create({ data: { name, muscleGroup, equipment, isCustom: false } });
    }
  }
}

// A starter library makes the workout endpoints usable immediately after the first database migration.
seedExercises()
  .then(() => console.log(`Seeded ${exercises.length} starter exercise definitions.`))
  .catch(error => {
    console.error("Could not seed the exercise library.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
