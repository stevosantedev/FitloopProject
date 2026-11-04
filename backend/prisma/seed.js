/**
 * Seed the first-party exercise catalogue and canonical muscle list.
 *
 * This script is safe to run repeatedly: muscle rows are upserted by stable
 * slug, existing starter exercises are enriched in place, and exercise/muscle
 * links use their compound key. Descriptive fields are authored catalogue
 * content; media fields stay empty until a properly licensed asset is added.
 */
import { prisma } from "../src/prisma.js";

// Anatomy records are deliberately separate from exercise labels. One canonical
// muscle can be shared by many exercises and can later be drawn in both map views.
const muscles = [
  ["pectoralis-major", "Pectoralis major", "Chest", "front"],
  ["anterior-deltoid", "Anterior deltoid", "Shoulders", "front"],
  ["lateral-deltoid", "Lateral deltoid", "Shoulders", "front"],
  ["posterior-deltoid", "Posterior deltoid", "Shoulders", "back"],
  ["biceps-brachii", "Biceps brachii", "Arms", "front"],
  ["triceps-brachii", "Triceps brachii", "Arms", "back"],
  ["brachialis", "Brachialis", "Arms", "front"],
  ["forearm-flexors", "Forearm flexors", "Arms", "front"],
  ["forearm-extensors", "Forearm extensors", "Arms", "back"],
  ["latissimus-dorsi", "Latissimus dorsi", "Back", "back"],
  ["trapezius", "Trapezius", "Back", "back"],
  ["rhomboids", "Rhomboids", "Back", "back"],
  ["erector-spinae", "Erector spinae", "Back", "back"],
  ["rectus-abdominis", "Rectus abdominis", "Core", "front"],
  ["obliques", "Obliques", "Core", "both"],
  ["gluteus-maximus", "Gluteus maximus", "Hips", "back"],
  ["gluteus-medius", "Gluteus medius", "Hips", "both"],
  ["quadriceps", "Quadriceps", "Legs", "front"],
  ["hamstrings", "Hamstrings", "Legs", "back"],
  ["adductors", "Adductors", "Legs", "front"],
  ["gastrocnemius", "Gastrocnemius", "Lower legs", "back"],
  ["soleus", "Soleus", "Lower legs", "back"],
  ["tibialis-anterior", "Tibialis anterior", "Lower legs", "front"]
];

// Each entry includes prime movers and supporting muscles. The exercise
// instructions describe general technique, not individual medical advice.
const exercises = [
  { slug: "push-up", name: "Push-up", muscleGroup: "Chest", equipment: "Bodyweight", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Start in a high plank with hands just wider than shoulder width.", "Lower your chest under control while keeping your body in a straight line.", "Press the floor away to return to the start."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid", "rectus-abdominis"] },
  { slug: "bench-press", name: "Bench press", muscleGroup: "Chest", equipment: "Barbell", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie with eyes beneath the bar and feet planted.", "Lower the bar towards the mid-chest with wrists stacked over elbows.", "Press upwards without bouncing the bar."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "incline-dumbbell-press", name: "Incline dumbbell press", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Incline push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set the bench to a modest incline and hold dumbbells above the chest.", "Lower the weights beside the upper chest with control.", "Press up while keeping the shoulders stable."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid", "triceps-brachii"] },
  { slug: "chest-fly", name: "Dumbbell chest fly", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal adduction", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie on a flat bench with a slight bend in each elbow.", "Open the arms until a comfortable chest stretch is reached.", "Bring the weights together above the chest without changing the elbow angle."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid"] },
  { slug: "overhead-press", name: "Overhead press", muscleGroup: "Shoulders", equipment: "Barbell", category: "Strength", movementPattern: "Vertical push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Hold the bar at upper-chest height with wrists stacked over elbows.", "Brace the trunk and press the bar overhead.", "Lower the bar under control to the starting position."], primary: ["anterior-deltoid", "lateral-deltoid"], secondary: ["triceps-brachii", "trapezius"] },
  { slug: "lateral-raise", name: "Lateral raise", muscleGroup: "Shoulders", equipment: "Dumbbell", category: "Strength", movementPattern: "Shoulder abduction", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand tall with dumbbells by the sides.", "Raise the arms outwards with a soft elbow bend.", "Stop around shoulder height and lower slowly."], primary: ["lateral-deltoid"], secondary: ["trapezius"] },
  { slug: "rear-delt-fly", name: "Rear delt fly", muscleGroup: "Shoulders", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hinge at the hips and let the weights hang beneath the shoulders.", "Raise the arms out to the sides while keeping the torso still.", "Lower slowly without swinging."], primary: ["posterior-deltoid"], secondary: ["rhomboids", "trapezius"] },
  { slug: "pull-up", name: "Pull-up", muscleGroup: "Back", equipment: "Pull-up bar", category: "Strength", movementPattern: "Vertical pull", bodyRegion: "Upper body", difficulty: "Advanced", instructions: ["Hang from the bar with a comfortable overhand grip.", "Pull the elbows down until the chin clears the bar.", "Lower to a controlled hang."], primary: ["latissimus-dorsi"], secondary: ["biceps-brachii", "rhomboids", "trapezius"] },
  { slug: "lat-pulldown", name: "Lat pulldown", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Vertical pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Sit with thighs secured and take a comfortable wide grip.", "Pull the bar towards the upper chest while keeping the torso steady.", "Return the bar overhead under control."], primary: ["latissimus-dorsi"], secondary: ["biceps-brachii", "rhomboids"] },
  { slug: "seated-cable-row", name: "Seated row", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Sit upright with knees softly bent and arms extended.", "Pull the handle towards the lower ribs while drawing the shoulder blades back.", "Extend the arms slowly without rounding the lower back."], primary: ["latissimus-dorsi", "rhomboids"], secondary: ["biceps-brachii", "trapezius"] },
  { slug: "barbell-row", name: "Barbell row", muscleGroup: "Back", equipment: "Barbell", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Hinge at the hips with a neutral spine and hold the bar below the shoulders.", "Row the bar towards the lower ribs.", "Lower it steadily while maintaining the hinge."], primary: ["latissimus-dorsi", "rhomboids"], secondary: ["posterior-deltoid", "biceps-brachii", "erector-spinae"] },
  { slug: "biceps-curl", name: "Biceps curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand with elbows close to the torso and palms facing forwards.", "Curl the weights towards the shoulders without swinging.", "Lower until the elbows are comfortably extended."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors"] },
  { slug: "hammer-curl", name: "Hammer curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hold dumbbells with palms facing each other.", "Curl while keeping the wrists neutral and elbows near the torso.", "Lower the weights slowly."], primary: ["brachialis"], secondary: ["biceps-brachii", "forearm-flexors"] },
  { slug: "triceps-pushdown", name: "Triceps pushdown", muscleGroup: "Arms", equipment: "Cable", category: "Strength", movementPattern: "Elbow extension", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand facing the cable with elbows tucked by the sides.", "Extend the elbows to move the handle down.", "Return until the forearms are just above parallel."], primary: ["triceps-brachii"], secondary: ["forearm-extensors"] },
  { slug: "overhead-triceps-extension", name: "Overhead triceps extension", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow extension", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hold one dumbbell overhead with elbows pointing forwards.", "Bend the elbows to lower the weight behind the head.", "Extend the elbows to raise it without flaring excessively."], primary: ["triceps-brachii"], secondary: ["anterior-deltoid"] },
  { slug: "squat", name: "Squat", muscleGroup: "Legs", equipment: "Barbell", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Set the bar securely and stand with feet around shoulder width.", "Sit down between the hips while keeping the whole foot grounded.", "Drive through the floor to stand tall."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["adductors", "erector-spinae"] },
  { slug: "goblet-squat", name: "Goblet squat", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Hold one dumbbell close to the chest.", "Bend the knees and hips while keeping the torso controlled.", "Push through the feet to return to standing."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["adductors", "rectus-abdominis"] },
  { slug: "romanian-deadlift", name: "Romanian deadlift", muscleGroup: "Legs", equipment: "Barbell", category: "Strength", movementPattern: "Hip hinge", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Stand with the bar against the thighs and knees softly bent.", "Push the hips backwards as the bar travels close to the legs.", "Drive the hips forwards to stand without leaning back."], primary: ["hamstrings", "gluteus-maximus"], secondary: ["erector-spinae", "forearm-flexors"] },
  { slug: "deadlift", name: "Conventional deadlift", muscleGroup: "Back", equipment: "Barbell", category: "Strength", movementPattern: "Hip hinge", bodyRegion: "Full body", difficulty: "Advanced", instructions: ["Stand with the bar over the middle of the feet.", "Brace, take the slack out of the bar and push the floor away.", "Stand tall, then return the bar to the floor with control."], primary: ["gluteus-maximus", "hamstrings"], secondary: ["quadriceps", "erector-spinae", "forearm-flexors"] },
  { slug: "lunge", name: "Lunge", muscleGroup: "Legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Single-leg", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand tall and step forwards into a comfortable stride.", "Lower until both knees bend while keeping the front foot planted.", "Push through the front foot to return to standing."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["gluteus-medius", "hamstrings"] },
  { slug: "leg-press", name: "Leg press", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Sit with the back supported and feet placed on the platform.", "Lower the platform until the knees reach a comfortable depth.", "Press through the feet without locking the knees forcefully."], primary: ["quadriceps"], secondary: ["gluteus-maximus", "hamstrings"] },
  { slug: "leg-curl", name: "Seated leg curl", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Knee flexion", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Adjust the pads so the machine pivots align with the knees.", "Curl the heels down and back.", "Return slowly to the start."], primary: ["hamstrings"], secondary: ["gastrocnemius"] },
  { slug: "calf-raise", name: "Standing calf raise", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Plantar flexion", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand with the balls of the feet on the platform.", "Rise onto the toes through a comfortable range.", "Lower the heels slowly to the starting position."], primary: ["gastrocnemius"], secondary: ["soleus"] },
  { slug: "plank", name: "Plank", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Anti-extension", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Place forearms on the floor with elbows beneath the shoulders.", "Lift the hips so shoulders, hips and ankles form a straight line.", "Breathe steadily while keeping the trunk braced."], primary: ["rectus-abdominis"], secondary: ["obliques"] },
  { slug: "dead-bug", name: "Dead bug", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Anti-extension", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Lie on the back with arms raised and hips and knees bent.", "Extend the opposite arm and leg while keeping the lower back gently connected to the floor.", "Return and alternate sides."], primary: ["rectus-abdominis"], secondary: ["obliques"] },
  { slug: "side-plank", name: "Side plank", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Anti-lateral flexion", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Lie on one side with the elbow beneath the shoulder.", "Lift the hips until the body forms a straight line.", "Hold while breathing steadily, then switch sides."], primary: ["obliques"], secondary: ["gluteus-medius", "rectus-abdominis"] },
  { slug: "hip-thrust", name: "Barbell hip thrust", muscleGroup: "Legs", equipment: "Barbell", category: "Strength", movementPattern: "Hip extension", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Rest the upper back against a bench with the bar secured over the hips.", "Drive through the feet to raise the hips.", "Pause at the top without arching the lower back, then lower."], primary: ["gluteus-maximus"], secondary: ["hamstrings", "gluteus-medius"] },
  { slug: "glute-bridge", name: "Glute bridge", muscleGroup: "Legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Hip extension", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Lie on the back with knees bent and feet flat.", "Squeeze the glutes to lift the hips.", "Lower with control without flaring the ribs."], primary: ["gluteus-maximus"], secondary: ["hamstrings"] },
  { slug: "mountain-climber", name: "Mountain climber", muscleGroup: "Core", equipment: "Bodyweight", category: "Conditioning", movementPattern: "Dynamic core", bodyRegion: "Full body", difficulty: "Beginner", instructions: ["Start in a high plank with shoulders above wrists.", "Drive one knee towards the chest, then switch legs.", "Keep the hips steady as the pace increases."], primary: ["rectus-abdominis"], secondary: ["obliques", "anterior-deltoid"] },
  { slug: "jumping-jack", name: "Jumping jack", muscleGroup: "Full body", equipment: "Bodyweight", category: "Cardio", movementPattern: "Locomotion", bodyRegion: "Full body", difficulty: "Beginner", instructions: ["Stand with feet together and arms by the sides.", "Jump feet apart while raising the arms overhead.", "Jump back to the starting position at a controlled pace."], primary: ["quadriceps"], secondary: ["gastrocnemius", "lateral-deltoid"] }
];

async function seedCatalogue() {
  // Upsert anatomy rows first because exercise links depend on their stable slugs.
  for (const [slug, name, bodyRegion, view] of muscles) {
    await prisma.muscle.upsert({
      where: { slug },
      update: { name, bodyRegion, view },
      create: { slug, name, bodyRegion, view }
    });
  }

  // Enrich matching starter records in place so an existing database does not
  // acquire duplicate copies of its original fourteen exercise definitions.
  for (const definition of exercises) {
    const existing = await prisma.exercise.findFirst({
      where: { name: definition.name, isCustom: false, ownerId: null }
    });
    const { primary, secondary, ...exerciseData } = definition;
    const exercise = existing
      ? await prisma.exercise.update({ where: { id: existing.id }, data: exerciseData })
      : await prisma.exercise.create({ data: { ...exerciseData, isCustom: false } });

    // Upsert each target separately so rerunning the seed updates roles without
    // deleting links that may have been curated manually in the database.
    for (const [slugs, role] of [[primary, "PRIMARY"], [secondary, "SECONDARY"]]) {
      for (const muscleSlug of slugs) {
        const muscle = await prisma.muscle.findUnique({ where: { slug: muscleSlug } });
        await prisma.exerciseMuscle.upsert({
          where: { exerciseId_muscleId: { exerciseId: exercise.id, muscleId: muscle.id } },
          update: { role },
          create: { exerciseId: exercise.id, muscleId: muscle.id, role }
        });
      }
    }
  }
}

seedCatalogue()
  .then(() => console.log(`Seeded ${exercises.length} exercises and ${muscles.length} muscle definitions.`))
  .catch(error => {
    console.error("Could not seed the FitLoop exercise catalogue.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
