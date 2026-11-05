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
  ["tibialis-anterior", "Tibialis anterior", "Lower legs", "front"],
  ["serratus-anterior", "Serratus anterior", "Chest", "front"],
  ["rotator-cuff", "Rotator cuff", "Shoulders", "both"],
  ["iliopsoas", "Iliopsoas", "Hips", "front"],
  ["peroneals", "Peroneal muscles", "Lower legs", "both"],
  ["lower-trapezius", "Lower trapezius", "Back", "back"],
  ["transverse-abdominis", "Transverse abdominis", "Core", "front"],
  ["gluteus-minimus", "Gluteus minimus", "Hips", "both"],
  ["levator-scapulae", "Levator scapulae", "Back", "back"]
];

// Each entry includes prime movers and supporting muscles. The exercise
// instructions describe general technique, not individual medical advice.
const exercises = [
  { slug: "push-up", name: "Push-up", muscleGroup: "Chest", equipment: "Bodyweight", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Start in a high plank with hands just wider than shoulder width.", "Lower your chest under control while keeping your body in a straight line.", "Press the floor away to return to the start."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid", "rectus-abdominis"] },
  { slug: "bench-press", name: "Bench press", muscleGroup: "Chest", equipment: "Barbell", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie with eyes beneath the bar and feet planted.", "Lower the bar towards the mid-chest with wrists stacked over elbows.", "Press upwards without bouncing the bar."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "incline-dumbbell-press", name: "Incline dumbbell press", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Incline push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set the bench to a modest incline and hold dumbbells above the chest.", "Lower the weights beside the upper chest with control.", "Press up while keeping the shoulders stable."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid", "triceps-brachii"] },
  { slug: "chest-fly", name: "Dumbbell chest fly", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal adduction", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie on a flat bench with a slight bend in each elbow.", "Open the arms until a comfortable chest stretch is reached.", "Bring the weights together above the chest without changing the elbow angle."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid"] },
  { slug: "overhead-press", name: "Overhead press", muscleGroup: "Shoulders", equipment: "Barbell", category: "Strength", movementPattern: "Vertical push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Hold the bar at upper-chest height with wrists stacked over elbows.", "Brace the trunk and press the bar overhead.", "Lower the bar under control to the starting position."], primary: ["anterior-deltoid", "lateral-deltoid"], secondary: ["triceps-brachii", "trapezius", "lower-trapezius"] },
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
  { slug: "jumping-jack", name: "Jumping jack", muscleGroup: "Full body", equipment: "Bodyweight", category: "Cardio", movementPattern: "Locomotion", bodyRegion: "Full body", difficulty: "Beginner", instructions: ["Stand with feet together and arms by the sides.", "Jump feet apart while raising the arms overhead.", "Jump back to the starting position at a controlled pace."], primary: ["quadriceps"], secondary: ["gastrocnemius", "lateral-deltoid"] },
  { slug: "machine-chest-press", name: "Machine chest press", muscleGroup: "Chest", equipment: "Machine", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Beginner", aliases: ["seated chest press"], equipmentAlternatives: ["Dumbbell", "Resistance band"], instructions: ["Adjust the seat so the handles align with mid-chest.", "Press the handles forwards without locking the elbows.", "Return slowly until the elbows are slightly behind the torso."], coachingCues: ["Keep shoulder blades supported", "Use a controlled return"], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "cable-crossover", name: "Cable crossover", muscleGroup: "Chest", equipment: "Cable", category: "Strength", movementPattern: "Horizontal adduction", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Stand between the pulleys with a staggered stance.", "Bring the handles forwards in a smooth arc.", "Return until the chest feels a comfortable stretch."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid"] },
  { slug: "parallel-bar-dip", name: "Parallel bar dip", muscleGroup: "Chest", equipment: "Dip bars", category: "Strength", movementPattern: "Vertical push", bodyRegion: "Upper body", difficulty: "Advanced", instructions: ["Support the body on parallel bars with elbows extended.", "Bend the elbows and lower within a comfortable shoulder range.", "Press back to the top without swinging."], primary: ["pectoralis-major", "triceps-brachii"], secondary: ["anterior-deltoid"] },
  { slug: "close-grip-bench-press", name: "Close-grip bench press", muscleGroup: "Arms", equipment: "Barbell", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie on the bench and grip the bar around shoulder width.", "Lower towards the lower chest while keeping elbows closer to the torso.", "Press to the start with wrists stacked over elbows."], primary: ["triceps-brachii"], secondary: ["pectoralis-major", "anterior-deltoid"] },
  { slug: "face-pull", name: "Cable face pull", muscleGroup: "Shoulders", equipment: "Cable", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set the cable around face height and hold the rope ends.", "Pull towards the face while moving the hands apart.", "Return slowly without shrugging excessively."], primary: ["posterior-deltoid", "rotator-cuff"], secondary: ["trapezius", "rhomboids"] },
  { slug: "dumbbell-shrug", name: "Dumbbell shrug", muscleGroup: "Back", equipment: "Dumbbell", category: "Strength", movementPattern: "Scapular elevation", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand tall with dumbbells by the sides.", "Raise the shoulders vertically without rolling them.", "Lower slowly to a relaxed position."], primary: ["trapezius"], secondary: ["levator-scapulae"] },
  { slug: "reverse-machine-fly", name: "Reverse machine fly", muscleGroup: "Shoulders", equipment: "Machine", category: "Strength", movementPattern: "Horizontal abduction", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set the seat so the handles are level with the shoulders.", "Move the arms out and back with a soft elbow bend.", "Return under control without letting the weights slam."], primary: ["posterior-deltoid"], secondary: ["rhomboids", "trapezius"] },
  { slug: "single-arm-dumbbell-row", name: "Single-arm dumbbell row", muscleGroup: "Back", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Support one hand on a bench and hinge at the hips.", "Pull the dumbbell towards the hip while keeping the torso stable.", "Lower until the arm is extended, then switch sides."], primary: ["latissimus-dorsi"], secondary: ["rhomboids", "biceps-brachii", "posterior-deltoid"] },
  { slug: "chest-supported-row", name: "Chest-supported row", muscleGroup: "Back", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Lie chest-down on an inclined bench with weights hanging below.", "Row the weights towards the sides of the rib cage.", "Lower slowly while keeping the chest supported."], primary: ["rhomboids", "latissimus-dorsi"], secondary: ["biceps-brachii", "posterior-deltoid"] },
  { slug: "arnold-press", name: "Arnold press", muscleGroup: "Shoulders", equipment: "Dumbbell", category: "Strength", movementPattern: "Vertical push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Start with dumbbells in front of the shoulders and palms facing you.", "Rotate the palms forwards as you press overhead.", "Reverse the rotation while lowering with control."], primary: ["anterior-deltoid", "lateral-deltoid"], secondary: ["triceps-brachii", "rotator-cuff"] },
  { slug: "front-raise", name: "Dumbbell front raise", muscleGroup: "Shoulders", equipment: "Dumbbell", category: "Strength", movementPattern: "Shoulder flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hold dumbbells in front of the thighs.", "Raise one or both arms to around shoulder height.", "Lower slowly without leaning backwards."], primary: ["anterior-deltoid"], secondary: ["pectoralis-major"] },
  { slug: "leg-extension", name: "Leg extension", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Knee extension", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Align the machine pivot with the knee joint.", "Extend the knees smoothly without kicking.", "Lower the pad slowly to the start."], primary: ["quadriceps"], secondary: [] },
  { slug: "bulgarian-split-squat", name: "Bulgarian split squat", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Single-leg squat", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Place the rear foot on a stable bench and find a balanced stance.", "Lower the hips while keeping the front foot flat.", "Drive through the front foot to stand."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["gluteus-medius", "adductors"] },
  { slug: "step-up", name: "Dumbbell step-up", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Single-leg", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand facing a stable step with dumbbells at the sides.", "Place the whole lead foot on the step and drive through it.", "Step down carefully and alternate legs."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["gluteus-medius", "hamstrings"] },
  { slug: "sumo-squat", name: "Sumo squat", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand with a wider stance and toes turned slightly out.", "Bend the knees and hips while keeping the chest lifted.", "Push through the floor to return to standing."], primary: ["quadriceps", "adductors"], secondary: ["gluteus-maximus"] },
  { slug: "back-extension", name: "Back extension", muscleGroup: "Back", equipment: "Bench", category: "Strength", movementPattern: "Trunk extension", bodyRegion: "Posterior chain", difficulty: "Beginner", instructions: ["Position the hips on the pad with feet secured.", "Lower the torso by hinging at the hips.", "Raise until the body is aligned without overextending."], primary: ["erector-spinae"], secondary: ["gluteus-maximus", "hamstrings"] },
  { slug: "hip-abduction", name: "Seated hip abduction", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Hip abduction", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Sit with the pads against the outside of the knees.", "Move the knees apart smoothly.", "Return slowly without letting the weights drop."], primary: ["gluteus-medius", "gluteus-minimus"], secondary: ["gluteus-maximus"] },
  { slug: "hip-adduction", name: "Seated hip adduction", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Hip adduction", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Sit with the pads against the inside of the knees.", "Bring the knees together smoothly.", "Return to the start under control."], primary: ["adductors"], secondary: ["iliopsoas"] },
  { slug: "seated-calf-raise", name: "Seated calf raise", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Plantar flexion", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Sit with the balls of the feet on the platform and knees beneath the pad.", "Raise the heels through a comfortable range.", "Lower slowly to the starting position."], primary: ["soleus"], secondary: ["gastrocnemius"] },
  { slug: "tibialis-raise", name: "Tibialis raise", muscleGroup: "Lower legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Dorsiflexion", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand with the back supported against a wall and heels on the floor.", "Lift the toes towards the shins.", "Lower the toes slowly."], primary: ["tibialis-anterior"], secondary: ["peroneals"] },
  { slug: "hanging-knee-raise", name: "Hanging knee raise", muscleGroup: "Core", equipment: "Pull-up bar", category: "Core", movementPattern: "Hip flexion", bodyRegion: "Core", difficulty: "Intermediate", instructions: ["Hang from a stable bar with shoulders engaged.", "Raise the knees towards the torso without swinging.", "Lower slowly to a controlled hang."], primary: ["rectus-abdominis"], secondary: ["iliopsoas", "transverse-abdominis"] },
  { slug: "cable-crunch", name: "Kneeling cable crunch", muscleGroup: "Core", equipment: "Cable", category: "Core", movementPattern: "Trunk flexion", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Kneel below a high cable and hold the rope beside the head.", "Curl the ribs towards the pelvis without pulling with the arms.", "Return slowly while keeping the hips steady."], primary: ["rectus-abdominis"], secondary: ["obliques", "transverse-abdominis"] },
  { slug: "bicycle-crunch", name: "Bicycle crunch", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Trunk rotation", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Lie on the back with hands lightly supporting the head.", "Bring one knee towards the torso while rotating the opposite shoulder towards it.", "Alternate sides smoothly without pulling the neck."], primary: ["obliques"], secondary: ["rectus-abdominis"] },
  { slug: "burpee", name: "Burpee", muscleGroup: "Full body", equipment: "Bodyweight", category: "Conditioning", movementPattern: "Full body conditioning", bodyRegion: "Full body", difficulty: "Intermediate", instructions: ["Start standing and place the hands on the floor.", "Step or jump the feet back to a plank, then return them forwards.", "Stand up and add a jump only if comfortable."], primary: ["quadriceps"], secondary: ["pectoralis-major", "rectus-abdominis", "gastrocnemius"] },
  { slug: "high-knees", name: "High knees", muscleGroup: "Full body", equipment: "Bodyweight", category: "Cardio", movementPattern: "Locomotion", bodyRegion: "Full body", difficulty: "Beginner", instructions: ["Stand tall with feet hip-width apart.", "Alternate driving the knees upwards while moving the arms naturally.", "Choose a pace that allows controlled foot placement."], primary: ["iliopsoas"], secondary: ["quadriceps", "gastrocnemius"] },
  { slug: "mountain-climber-cross-body", name: "Cross-body mountain climber", muscleGroup: "Core", equipment: "Bodyweight", category: "Conditioning", movementPattern: "Dynamic core", bodyRegion: "Full body", difficulty: "Intermediate", instructions: ["Start in a high plank with the shoulders over the wrists.", "Bring one knee towards the opposite elbow.", "Alternate sides while keeping the hips controlled."], primary: ["obliques"], secondary: ["rectus-abdominis", "anterior-deltoid"] },
  { slug: "wall-sit", name: "Wall sit", muscleGroup: "Legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Isometric squat", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Lean against a wall and walk the feet forwards.", "Slide down until the knees are comfortably bent.", "Hold while breathing steadily, then stand up carefully."], primary: ["quadriceps"], secondary: ["gluteus-maximus"] },
  { slug: "bird-dog", name: "Bird dog", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Anti-rotation", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Start on hands and knees with the spine neutral.", "Reach the opposite arm and leg away from the body.", "Return slowly and alternate sides without rotating the hips."], primary: ["transverse-abdominis"], secondary: ["erector-spinae", "gluteus-maximus"] },
  { slug: "incline-barbell-bench-press", name: "Incline barbell bench press", muscleGroup: "Chest", equipment: "Barbell", category: "Strength", movementPattern: "Incline horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Set the bench to a modest incline and secure the bar above the chest.", "Lower the bar towards the upper chest with wrists stacked over elbows.", "Press upwards while keeping the shoulder blades supported."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid", "triceps-brachii"] },
  { slug: "decline-bench-press", name: "Decline bench press", muscleGroup: "Chest", equipment: "Barbell", category: "Strength", movementPattern: "Decline horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Secure the feet and lie back on a decline bench.", "Lower the bar towards the lower chest under control.", "Press to the start without bouncing the bar."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "dumbbell-pullover", name: "Dumbbell pullover", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Shoulder extension", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie across a bench or along it with the dumbbell held securely above the chest.", "Lower the weight in an arc while keeping a comfortable elbow bend.", "Bring the weight back above the chest without forcing shoulder range."], primary: ["pectoralis-major"], secondary: ["latissimus-dorsi", "serratus-anterior"] },
  { slug: "pec-deck-fly", name: "Pec deck fly", muscleGroup: "Chest", equipment: "Machine", category: "Strength", movementPattern: "Horizontal adduction", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Adjust the seat so the upper arms are level with the chest.", "Bring the pads together in a smooth arc.", "Return slowly until the chest feels a comfortable stretch."], primary: ["pectoralis-major"], secondary: ["anterior-deltoid"] },
  { slug: "neutral-grip-lat-pulldown", name: "Neutral-grip lat pulldown", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Vertical pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Use parallel handles and secure the thighs beneath the pad.", "Pull the handles towards the upper chest while keeping the torso steady.", "Allow the arms to extend under control at the top."], primary: ["latissimus-dorsi"], secondary: ["biceps-brachii", "brachialis", "rhomboids"] },
  { slug: "straight-arm-pulldown", name: "Straight-arm cable pulldown", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Shoulder extension", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand facing a high cable with a slight hinge at the hips.", "Pull the bar down towards the thighs with a soft elbow bend.", "Return slowly without allowing the torso to sway."], primary: ["latissimus-dorsi"], secondary: ["triceps-brachii", "serratus-anterior"] },
  { slug: "chest-supported-t-bar-row", name: "Chest-supported T-bar row", muscleGroup: "Back", equipment: "Machine", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Set the chest pad so the handles are within comfortable reach.", "Pull the handles towards the torso without lifting the chest from the pad.", "Lower until the arms extend while maintaining control."], primary: ["latissimus-dorsi", "rhomboids"], secondary: ["biceps-brachii", "posterior-deltoid", "trapezius"] },
  { slug: "preacher-curl", name: "Preacher curl", muscleGroup: "Arms", equipment: "EZ bar", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Rest the upper arms on the preacher pad and hold the bar comfortably.", "Curl the bar without lifting the upper arms from the pad.", "Lower slowly without forcing the elbows into lockout."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors"] },
  { slug: "concentration-curl", name: "Concentration curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Sit with the upper arm supported against the inner thigh.", "Curl the dumbbell towards the shoulder without swinging.", "Lower slowly and repeat on the other arm."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors"] },
  { slug: "cable-biceps-curl", name: "Cable biceps curl", muscleGroup: "Arms", equipment: "Cable", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand facing a low cable with elbows close to the torso.", "Curl the handle while keeping the upper arms still.", "Lower under control to the start."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors"] },
  { slug: "skull-crusher", name: "Lying triceps extension", muscleGroup: "Arms", equipment: "EZ bar", category: "Strength", movementPattern: "Elbow extension", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie on a bench and hold the bar above the shoulders.", "Bend the elbows to lower the bar towards the forehead or just behind the head.", "Extend the elbows to return while keeping upper arms steady."], primary: ["triceps-brachii"], secondary: ["forearm-flexors"] },
  { slug: "cable-lateral-raise", name: "Single-arm cable lateral raise", muscleGroup: "Shoulders", equipment: "Cable", category: "Strength", movementPattern: "Shoulder abduction", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Stand side-on to a low cable and hold the handle with the outside hand.", "Raise the arm out to the side to a comfortable height.", "Lower slowly and repeat on the other side."], primary: ["lateral-deltoid"], secondary: ["rotator-cuff"] },
  { slug: "landmine-press", name: "Half-kneeling landmine press", muscleGroup: "Shoulders", equipment: "Barbell", category: "Strength", movementPattern: "Angled push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Kneel with the knee opposite the pressing arm forward and hold the bar end at shoulder height.", "Press forwards and upwards while keeping the trunk steady.", "Lower with control and switch sides."], primary: ["anterior-deltoid"], secondary: ["triceps-brachii", "serratus-anterior", "obliques"] },
  { slug: "front-squat", name: "Front squat", muscleGroup: "Legs", equipment: "Barbell", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Rest the bar across the front shoulders with elbows lifted.", "Sit between the hips while keeping the torso upright and feet grounded.", "Drive through the floor to stand."], primary: ["quadriceps"], secondary: ["gluteus-maximus", "erector-spinae"] },
  { slug: "hack-squat", name: "Hack squat", muscleGroup: "Legs", equipment: "Machine", category: "Strength", movementPattern: "Squat", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Position the shoulders beneath the pads and feet on the platform.", "Lower until the knees and hips reach a comfortable depth.", "Press through the feet without locking the knees forcefully."], primary: ["quadriceps"], secondary: ["gluteus-maximus"] },
  { slug: "good-morning", name: "Barbell good morning", muscleGroup: "Back", equipment: "Barbell", category: "Strength", movementPattern: "Hip hinge", bodyRegion: "Posterior chain", difficulty: "Advanced", instructions: ["Place a light bar across the upper back and stand with soft knees.", "Push the hips backwards while keeping the spine neutral.", "Return to standing by driving the hips forwards."], primary: ["erector-spinae"], secondary: ["hamstrings", "gluteus-maximus"] },
  { slug: "single-leg-romanian-deadlift", name: "Single-leg Romanian deadlift", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Single-leg hip hinge", bodyRegion: "Posterior chain", difficulty: "Intermediate", instructions: ["Stand on one foot while holding a light dumbbell in the opposite hand.", "Hinge at the hip as the free leg reaches behind you.", "Return to standing without rotating the pelvis and switch sides."], primary: ["hamstrings", "gluteus-maximus"], secondary: ["gluteus-medius", "erector-spinae"] },
  { slug: "reverse-lunge", name: "Reverse lunge", muscleGroup: "Legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Single-leg lunge", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Stand tall with feet hip-width apart.", "Step one foot backwards and lower both knees within a comfortable range.", "Push through the front foot to return and alternate sides."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["hamstrings", "gluteus-medius"] },
  { slug: "walking-lunge", name: "Walking lunge", muscleGroup: "Legs", equipment: "Dumbbell", category: "Strength", movementPattern: "Locomotion lunge", bodyRegion: "Lower body", difficulty: "Intermediate", instructions: ["Stand with space to step forwards and weights held at the sides if used.", "Take a controlled step and lower into a lunge.", "Drive through the front foot to step through and continue."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["hamstrings", "gluteus-medius"] },
  { slug: "cable-woodchop", name: "Cable woodchop", muscleGroup: "Core", equipment: "Cable", category: "Core", movementPattern: "Trunk rotation", bodyRegion: "Core", difficulty: "Intermediate", instructions: ["Stand side-on to a cable set high or low and hold the handle with both hands.", "Rotate the trunk through a controlled range while keeping the hips stable.", "Return slowly and repeat on the other side."], primary: ["obliques"], secondary: ["rectus-abdominis", "transverse-abdominis"] },
  { slug: "reverse-crunch", name: "Reverse crunch", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Posterior pelvic tilt", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Lie on the back with hips and knees bent.", "Curl the pelvis gently towards the ribs without swinging the legs.", "Lower slowly to the start."], primary: ["rectus-abdominis"], secondary: ["obliques", "transverse-abdominis"] },
  { slug: "hollow-body-hold", name: "Hollow body hold", muscleGroup: "Core", equipment: "Bodyweight", category: "Core", movementPattern: "Anti-extension", bodyRegion: "Core", difficulty: "Intermediate", instructions: ["Lie on the back and brace the abdomen.", "Lift the shoulders and legs while keeping the lower back comfortably supported.", "Hold while breathing, or bend the knees to reduce difficulty."], primary: ["rectus-abdominis"], secondary: ["transverse-abdominis", "obliques"] },
  { slug: "farmer-carry", name: "Farmer carry", muscleGroup: "Full body", equipment: "Dumbbell", category: "Conditioning", movementPattern: "Loaded carry", bodyRegion: "Full body", difficulty: "Beginner", instructions: ["Hold a weight in each hand with shoulders relaxed and trunk braced.", "Walk with steady steps while keeping the weights close to the sides.", "Set the weights down safely after the chosen distance or time."], primary: ["forearm-flexors"], secondary: ["trapezius", "rectus-abdominis", "obliques"] }
,
  { slug: "incline-push-up", name: "Incline push-up", muscleGroup: "Chest", equipment: "Bench", category: "Strength", movementPattern: "Incline horizontal push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Place the hands on a stable raised surface slightly wider than shoulder width.", "Lower the chest towards the surface while keeping the body aligned.", "Press away and keep the hips from sagging."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "close-grip-push-up", name: "Close-grip push-up", muscleGroup: "Arms", equipment: "Bodyweight", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Set the hands slightly narrower than shoulder width beneath the chest.", "Lower with elbows tracking close to the torso.", "Press back to a straight-arm plank without losing trunk position."], primary: ["triceps-brachii"], secondary: ["pectoralis-major", "anterior-deltoid"] },
  { slug: "dumbbell-floor-press", name: "Dumbbell floor press", muscleGroup: "Chest", equipment: "Dumbbell", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Lie on the floor with knees bent and dumbbells above the chest.", "Lower until the upper arms gently contact the floor.", "Press upwards while keeping wrists stacked over elbows."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "standing-cable-chest-press", name: "Standing cable chest press", muscleGroup: "Chest", equipment: "Cable", category: "Strength", movementPattern: "Horizontal push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Set pulleys around chest height and stand in a staggered stance.", "Press the handles forwards while resisting trunk rotation.", "Return slowly until the hands are beside the chest."], primary: ["pectoralis-major"], secondary: ["triceps-brachii", "anterior-deltoid"] },
  { slug: "assisted-pull-up", name: "Assisted pull-up", muscleGroup: "Back", equipment: "Assisted pull-up machine", category: "Strength", movementPattern: "Vertical pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set the assistance to a level that allows controlled repetitions.", "Start from an active hang and pull the chest towards the bar.", "Lower slowly to the start without dropping into the shoulders."], primary: ["latissimus-dorsi"], secondary: ["biceps-brachii", "rhomboids", "trapezius"] },
  { slug: "inverted-row", name: "Inverted row", muscleGroup: "Back", equipment: "Bar", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Set a secure bar around waist height and position beneath it.", "Keep the body straight and pull the chest towards the bar.", "Lower under control; bend the knees to reduce difficulty."], primary: ["rhomboids", "latissimus-dorsi"], secondary: ["biceps-brachii", "posterior-deltoid"] },
  { slug: "reverse-grip-lat-pulldown", name: "Reverse-grip lat pulldown", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Vertical pull", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hold the bar with an underhand grip around shoulder width.", "Pull towards the upper chest while keeping the torso steady.", "Return slowly until the arms are extended."], primary: ["latissimus-dorsi"], secondary: ["biceps-brachii", "brachialis", "rhomboids"] },
  { slug: "wide-grip-seated-row", name: "Wide-grip seated cable row", muscleGroup: "Back", equipment: "Cable", category: "Strength", movementPattern: "Horizontal pull", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Attach a wide handle and sit with knees slightly bent.", "Pull towards the upper abdomen while drawing the shoulder blades back.", "Extend the arms slowly without rounding the lower back."], primary: ["rhomboids", "posterior-deltoid"], secondary: ["latissimus-dorsi", "biceps-brachii", "trapezius"] },
  { slug: "spider-curl", name: "Spider curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Lie chest-down on an incline bench with arms hanging freely.", "Curl the weights without moving the upper arms.", "Lower slowly to full comfortable extension."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors"] },
  { slug: "reverse-curl", name: "Reverse curl", muscleGroup: "Arms", equipment: "EZ bar", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Hold the bar with palms facing down and elbows close to the torso.", "Curl the bar without swinging the shoulders.", "Lower under control."], primary: ["brachialis"], secondary: ["biceps-brachii", "forearm-extensors"] },
  { slug: "zottman-curl", name: "Zottman curl", muscleGroup: "Arms", equipment: "Dumbbell", category: "Strength", movementPattern: "Elbow flexion", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Curl dumbbells with palms facing forwards.", "Rotate the wrists near the top so palms face down.", "Lower slowly with the overhand grip, then rotate back at the bottom."], primary: ["biceps-brachii"], secondary: ["brachialis", "forearm-flexors", "forearm-extensors"] },
  { slug: "overhead-cable-triceps-extension", name: "Overhead cable triceps extension", muscleGroup: "Arms", equipment: "Cable", category: "Strength", movementPattern: "Elbow extension", bodyRegion: "Upper body", difficulty: "Beginner", instructions: ["Face away from a high cable and hold the rope behind the head.", "Extend the elbows while keeping the upper arms steady.", "Bend the elbows slowly to return."], primary: ["triceps-brachii"], secondary: ["serratus-anterior"] },
  { slug: "bench-dip", name: "Bench dip", muscleGroup: "Arms", equipment: "Bench", category: "Strength", movementPattern: "Vertical push", bodyRegion: "Upper body", difficulty: "Intermediate", instructions: ["Place the hands on a stable bench and move the hips just in front of it.", "Bend the elbows only through a comfortable shoulder range.", "Press through the hands to return to the top."], primary: ["triceps-brachii"], secondary: ["anterior-deltoid", "pectoralis-major"] },
  { slug: "sumo-deadlift", name: "Sumo deadlift", muscleGroup: "Legs", equipment: "Barbell", category: "Strength", movementPattern: "Hip hinge", bodyRegion: "Posterior chain", difficulty: "Advanced", instructions: ["Take a wide stance with toes turned out and the bar over the mid-foot.", "Brace the trunk and push through the floor while keeping the bar close.", "Stand tall, then lower the bar with control."], primary: ["gluteus-maximus", "adductors"], secondary: ["quadriceps", "hamstrings", "erector-spinae"] },
  { slug: "trap-bar-deadlift", name: "Trap-bar deadlift", muscleGroup: "Legs", equipment: "Trap bar", category: "Strength", movementPattern: "Hip hinge", bodyRegion: "Posterior chain", difficulty: "Intermediate", instructions: ["Stand centred inside the trap bar and grip the handles.", "Brace and push through the floor while keeping the handles close to the body.", "Stand tall and lower the bar under control."], primary: ["quadriceps", "gluteus-maximus"], secondary: ["hamstrings", "erector-spinae", "forearm-flexors"] },
  { slug: "glute-kickback", name: "Cable glute kickback", muscleGroup: "Legs", equipment: "Cable", category: "Strength", movementPattern: "Hip extension", bodyRegion: "Lower body", difficulty: "Beginner", instructions: ["Attach an ankle strap to a low cable and hold a stable support.", "Extend the working leg backwards without arching the lower back.", "Return slowly and repeat on the other side."], primary: ["gluteus-maximus"], secondary: ["hamstrings", "gluteus-medius"] },
  { slug: "nordic-hamstring-curl", name: "Nordic hamstring curl", muscleGroup: "Legs", equipment: "Bodyweight", category: "Strength", movementPattern: "Knee flexion", bodyRegion: "Lower body", difficulty: "Advanced", instructions: ["Secure the ankles beneath a stable support and kneel upright.", "Lower the torso forwards slowly while resisting the movement with the hamstrings.", "Use the hands to assist the return if needed."], primary: ["hamstrings"], secondary: ["gastrocnemius"] },
  { slug: "pallof-press", name: "Pallof press", muscleGroup: "Core", equipment: "Cable", category: "Core", movementPattern: "Anti-rotation", bodyRegion: "Core", difficulty: "Beginner", instructions: ["Stand side-on to a cable or band anchored at chest height.", "Hold the handle at the chest and press straight forwards without rotating.", "Bring the hands back slowly and repeat on the other side."], primary: ["obliques"], secondary: ["transverse-abdominis", "rectus-abdominis"] },
  { slug: "copenhagen-plank", name: "Copenhagen plank", muscleGroup: "Core", equipment: "Bench", category: "Core", movementPattern: "Adduction and anti-lateral flexion", bodyRegion: "Core", difficulty: "Advanced", instructions: ["Support the upper leg on a stable bench and position the elbow below the shoulder.", "Lift the hips while keeping the body aligned.", "Hold briefly or use a bent-knee variation to reduce difficulty."], primary: ["adductors"], secondary: ["obliques", "gluteus-medius"] },
  { slug: "hanging-leg-raise", name: "Hanging leg raise", muscleGroup: "Core", equipment: "Pull-up bar", category: "Core", movementPattern: "Hip flexion", bodyRegion: "Core", difficulty: "Advanced", instructions: ["Hang from a stable bar with shoulders engaged.", "Raise the legs without swinging or arching the back.", "Lower slowly to a controlled hang."], primary: ["rectus-abdominis"], secondary: ["iliopsoas", "transverse-abdominis"] }

];


// Curated guide content for frequently used movements. Keep these notes tied
// to the actual setup and execution of each movement rather than filling every
// catalogue record with the same generic coaching language.
const exerciseGuides = {
  "push-up": {
    description: "A bodyweight horizontal press performed from a rigid plank, using the chest, triceps and front shoulders to move the body.",
    aliases: ["press-up"],
    coachingCues: ["Keep the ribs and hips moving together", "Lower under control", "Press the floor away"],
    equipmentAlternatives: ["Incline push-up using a bench", "Resistance band"]
  },
  "bench-press": {
    description: "A barbell horizontal press performed on a bench, commonly used to develop pressing strength through the chest, triceps and shoulders.",
    aliases: ["barbell bench press", "flat bench press"],
    coachingCues: ["Keep both feet planted", "Lower towards the mid-chest", "Keep wrists stacked over the forearms"],
    equipmentAlternatives: ["Dumbbell", "Smith machine"]
  },
  "incline-dumbbell-press": {
    description: "A dumbbell press performed on an inclined bench to train the upper portion of the chest alongside the front shoulders and triceps.",
    aliases: ["incline DB press"],
    coachingCues: ["Use a modest bench incline", "Keep forearms close to vertical", "Lower both dumbbells evenly"],
    equipmentAlternatives: ["Barbell", "Smith machine"]
  },
  "overhead-press": {
    description: "A standing barbell press that moves a load from shoulder height to overhead, training the shoulders and triceps while the trunk stabilises the body.",
    aliases: ["standing shoulder press", "military press"],
    coachingCues: ["Brace before each press", "Move the head clear of the bar", "Finish with the bar over the mid-foot"],
    equipmentAlternatives: ["Dumbbell", "Machine"]
  },
  "lateral-raise": {
    description: "A shoulder isolation movement that raises the arms out to the sides against resistance, with emphasis on the lateral deltoids.",
    aliases: ["side raise", "dumbbell lateral raise"],
    coachingCues: ["Lead with the elbows", "Keep the torso still", "Use a load you can lower slowly"],
    equipmentAlternatives: ["Cable", "Resistance band"]
  },
  "pull-up": {
    description: "A vertical bodyweight pull from a hanging position, using the back and elbow flexors to raise the body towards a fixed bar.",
    aliases: ["overhand pull-up"],
    coachingCues: ["Start from a controlled hang", "Drive the elbows down", "Avoid swinging to create momentum"],
    equipmentAlternatives: ["Assisted pull-up machine", "Lat pulldown", "Resistance band"]
  },
  "lat-pulldown": {
    description: "A cable-based vertical pull that brings an overhead bar towards the upper chest to train the lats and supporting upper-back muscles.",
    aliases: ["lat pull-down"],
    coachingCues: ["Keep the torso steady", "Pull the elbows towards the sides", "Allow the arms to extend on the return"],
    equipmentAlternatives: ["Resistance band", "Assisted pull-up machine"]
  },
  "seated-cable-row": {
    description: "A seated horizontal cable pull that trains the lats and mid-back while the trunk maintains a stable position.",
    aliases: ["seated row", "cable row"],
    coachingCues: ["Sit tall without leaning back", "Pull towards the lower ribs", "Reach forwards without rounding the lower back"],
    equipmentAlternatives: ["Dumbbell", "Resistance band", "Chest-supported row machine"]
  },
  "barbell-row": {
    description: "A hip-hinged barbell pull that brings the bar towards the torso, loading the lats, mid-back and supporting posterior-chain muscles.",
    aliases: ["bent-over row", "bent over barbell row"],
    coachingCues: ["Set the hip hinge before rowing", "Keep the bar close to the body", "Avoid using torso momentum"],
    equipmentAlternatives: ["Dumbbell", "Cable", "Chest-supported row machine"]
  },
  "biceps-curl": {
    description: "An elbow-flexion exercise that raises a dumbbell towards the shoulder to train the biceps and supporting forearm muscles.",
    aliases: ["dumbbell curl", "DB curl"],
    coachingCues: ["Keep the upper arms close to the torso", "Avoid swinging the hips", "Lower through a controlled range"],
    equipmentAlternatives: ["Barbell", "EZ bar", "Cable", "Resistance band"]
  },
  "hammer-curl": {
    description: "A neutral-grip curl that trains the brachialis and biceps while also challenging the forearm muscles.",
    aliases: ["neutral-grip curl"],
    coachingCues: ["Keep palms facing each other", "Keep wrists neutral", "Move only through the elbows"],
    equipmentAlternatives: ["Cable rope", "Resistance band"]
  },
  "triceps-pushdown": {
    description: "A cable elbow-extension exercise performed with the upper arms held near the torso to emphasise the triceps.",
    aliases: ["cable triceps pushdown", "tricep pushdown"],
    coachingCues: ["Keep elbows close to the sides", "Extend without rocking the torso", "Return the handle slowly"],
    equipmentAlternatives: ["Resistance band", "Dumbbell"]
  },
  "squat": {
    description: "A compound lower-body movement in which the hips and knees bend together before the lifter stands, training the quadriceps and glutes.",
    aliases: ["barbell back squat", "back squat"],
    coachingCues: ["Keep the whole foot grounded", "Let the knees track with the toes", "Brace before descending"],
    equipmentAlternatives: ["Dumbbell", "Goblet squat", "Leg press"]
  },
  "goblet-squat": {
    description: "A squat variation with one dumbbell or kettlebell held close to the chest, making it useful for learning a balanced squat pattern.",
    aliases: ["kettlebell goblet squat", "DB goblet squat"],
    coachingCues: ["Keep the weight close to the chest", "Allow the knees to track with the toes", "Keep pressure across the whole foot"],
    equipmentAlternatives: ["Kettlebell", "Bodyweight"]
  },
  "romanian-deadlift": {
    description: "A hip-hinge strength exercise that lowers a barbell along the legs with softly bent knees, loading the hamstrings and glutes.",
    aliases: ["RDL", "barbell RDL"],
    coachingCues: ["Push the hips backwards", "Keep the bar close to the legs", "Stop when the hips can no longer travel back without losing position"],
    equipmentAlternatives: ["Dumbbell", "Kettlebell", "Cable"]
  },
  "deadlift": {
    description: "A barbell lift from the floor to standing that combines leg drive and hip extension to train the glutes, hamstrings, quadriceps and trunk.",
    aliases: ["conventional deadlift", "barbell deadlift"],
    coachingCues: ["Set the bar over the mid-foot", "Brace before the bar leaves the floor", "Keep the bar close as it travels"],
    equipmentAlternatives: ["Trap bar", "Dumbbell", "Kettlebell"]
  },
  "lunge": {
    description: "A single-leg squat pattern performed with a forward step, training the quadriceps and glutes while challenging balance.",
    aliases: ["forward lunge"],
    coachingCues: ["Use a stride you can control", "Keep the front foot planted", "Drive through the front foot to stand"],
    equipmentAlternatives: ["Dumbbell", "Smith machine", "Bodyweight"]
  },
  "leg-press": {
    description: "A machine-based lower-body press that trains the quadriceps and glutes with the back supported against a pad.",
    aliases: ["45-degree leg press", "sled leg press"],
    coachingCues: ["Keep the pelvis supported", "Lower only as far as you can maintain position", "Avoid forcefully locking the knees"],
    equipmentAlternatives: ["Squat", "Goblet squat", "Hack squat"]
  },
  "plank": {
    description: "A static anti-extension exercise in which the trunk resists the pull of gravity while the body is supported on the forearms and toes.",
    aliases: ["forearm plank"],
    coachingCues: ["Keep shoulders, hips and ankles aligned", "Brace without holding your breath", "Avoid letting the lower back sag"],
    equipmentAlternatives: ["Incline plank", "Knee plank"]
  },
  "hip-thrust": {
    description: "A loaded hip-extension exercise performed with the upper back supported on a bench, primarily targeting the gluteus maximus.",
    aliases: ["barbell glute bridge"],
    coachingCues: ["Keep the chin gently tucked", "Finish by extending the hips, not arching the back", "Control the descent"],
    equipmentAlternatives: ["Dumbbell", "Smith machine", "Glute bridge"]
  },
  "chest-fly": {
    description: "A dumbbell chest isolation movement in which the arms travel through a wide arc while the elbows remain softly bent.",
    aliases: ["dumbbell fly", "DB fly"],
    coachingCues: ["Keep a small bend in the elbows", "Use a comfortable shoulder range", "Bring the arms together without bouncing"],
    equipmentAlternatives: ["Cable", "Pec deck machine", "Resistance band"]
  },
  "rear-delt-fly": {
    description: "A shoulder isolation movement that opens the arms out to the sides to emphasise the rear deltoids and upper-back muscles.",
    aliases: ["reverse fly", "bent-over rear delt raise"],
    coachingCues: ["Hinge or support the chest to stay steady", "Move from the shoulders", "Avoid shrugging towards the ears"],
    equipmentAlternatives: ["Cable", "Reverse fly machine", "Resistance band"]
  },
  "overhead-triceps-extension": {
    description: "An elbow-extension exercise performed with the arms raised overhead, loading the triceps through a lengthened position.",
    aliases: ["overhead tricep extension", "dumbbell overhead extension"],
    coachingCues: ["Keep the upper arms pointing mostly upwards", "Bend the elbows under control", "Avoid arching the lower back"],
    equipmentAlternatives: ["Cable rope", "EZ bar", "Resistance band"]
  },
  "leg-curl": {
    description: "A machine exercise that bends the knees against resistance to train the hamstrings.",
    aliases: ["seated hamstring curl", "hamstring curl"],
    coachingCues: ["Align the machine pivot with the knee", "Keep the hips against the pad", "Control the return to the start"],
    equipmentAlternatives: ["Lying leg curl machine", "Resistance band"]
  },
  "calf-raise": {
    description: "A standing plantar-flexion exercise that raises the heels to train the gastrocnemius and supporting calf muscles.",
    aliases: ["standing calf raise"],
    coachingCues: ["Use a stable foot position", "Rise through the balls of the feet", "Lower the heels through a controlled range"],
    equipmentAlternatives: ["Dumbbell", "Smith machine", "Leg press"]
  },
  "dead-bug": {
    description: "A floor-based core stability drill that moves opposite arms and legs while resisting extension through the trunk.",
    aliases: ["dead bug exercise"],
    coachingCues: ["Keep the lower back gently anchored", "Move opposite arm and leg together", "Shorten the range if the back lifts"],
    equipmentAlternatives: ["Heel taps", "Bent-knee dead bug"]
  },
  "side-plank": {
    description: "An isometric lateral-core exercise performed on one forearm and the side of the foot, resisting the hips dropping towards the floor.",
    aliases: ["lateral plank"],
    coachingCues: ["Stack the shoulder over the elbow", "Keep hips lifted and facing forwards", "Use the knees as a regression if needed"],
    equipmentAlternatives: ["Bent-knee side plank"]
  },
  "glute-bridge": {
    description: "A floor-based hip-extension exercise that raises the pelvis by contracting the glutes while the upper back remains on the ground.",
    aliases: ["floor glute bridge"],
    coachingCues: ["Keep feet flat and comfortably close", "Lift by squeezing the glutes", "Avoid finishing with an exaggerated lower-back arch"],
    equipmentAlternatives: ["Dumbbell", "Resistance band", "Hip thrust"]
  },
  "mountain-climber": {
    description: "A plank-based conditioning movement that alternates driving the knees forwards while the shoulders and trunk stabilise the body.",
    aliases: ["mountain climbers"],
    coachingCues: ["Keep shoulders over the hands", "Brace to limit hip bounce", "Choose a pace that preserves control"],
    equipmentAlternatives: ["Slow step-in mountain climber"]
  },
  "jumping-jack": {
    description: "A rhythmic full-body conditioning movement that alternates between feet apart with arms overhead and feet together with arms by the sides.",
    aliases: ["star jump", "star jumps"],
    coachingCues: ["Land softly", "Keep the movement rhythmic", "Use a step-out version if jumping is uncomfortable"],
    equipmentAlternatives: ["Low-impact step jack"]
  },
  "machine-chest-press": {
    description: "A seated machine press that trains the chest, triceps and front shoulders along a guided pressing path.",
    aliases: ["chest press machine"],
    coachingCues: ["Adjust handles around mid-chest height", "Keep shoulder blades supported", "Press without forcefully locking the elbows"],
    equipmentAlternatives: ["Dumbbell bench press", "Barbell bench press", "Resistance band"]
  },
  "cable-crossover": {
    description: "A standing cable fly variation that brings the arms across the front of the body to train the chest.",
    aliases: ["standing cable fly", "cable fly"],
    coachingCues: ["Set the pulleys to a suitable height", "Keep elbows softly bent", "Control the stretch and the return"],
    equipmentAlternatives: ["Dumbbell chest fly", "Resistance band"]
  },
  "parallel-bar-dip": {
    description: "A bodyweight pressing movement performed between parallel bars, involving the triceps, chest and front shoulders.",
    aliases: ["parallel bar dips", "bodyweight dip"],
    coachingCues: ["Keep shoulders controlled at the bottom", "Use a range your shoulders tolerate", "Avoid swinging the legs"],
    equipmentAlternatives: ["Assisted dip machine", "Bench-supported dip", "Close-grip push-up"]
  },
  "close-grip-bench-press": {
    description: "A barbell bench press using a narrower-than-usual hand position to increase the contribution of the triceps.",
    aliases: ["close grip bench"],
    coachingCues: ["Keep wrists stacked over elbows", "Choose a grip that keeps wrists comfortable", "Lower with elbows controlled"],
    equipmentAlternatives: ["Dumbbell close-grip press", "Cable press"]
  },
  "face-pull": {
    description: "A cable upper-body pull towards the face that trains the rear deltoids and upper-back muscles, including the external rotators.",
    aliases: ["rope face pull", "cable face pull"],
    coachingCues: ["Set the rope around upper-chest to face height", "Pull hands apart as they approach the face", "Keep ribs down and avoid leaning back"],
    equipmentAlternatives: ["Resistance band"]
  },
  "dumbbell-shrug": {
    description: "A loaded shoulder-elevation exercise that emphasises the upper trapezius while the arms remain straight.",
    aliases: ["DB shrug"],
    coachingCues: ["Lift shoulders vertically", "Pause briefly at the top", "Avoid rolling the shoulders"],
    equipmentAlternatives: ["Barbell", "Trap bar", "Cable"]
  },
  "reverse-machine-fly": {
    description: "A machine-based reverse fly that moves the arms out and back to train the rear deltoids and upper back.",
    aliases: ["reverse pec deck", "rear delt machine fly"],
    coachingCues: ["Set the seat so handles align comfortably", "Keep a soft bend in the elbows", "Move without thrusting the chest forwards"],
    equipmentAlternatives: ["Dumbbell rear-delt fly", "Cable"]
  },
  "single-arm-dumbbell-row": {
    description: "A unilateral horizontal pull using one dumbbell, allowing each side of the back to work independently.",
    aliases: ["one-arm dumbbell row", "single arm row"],
    coachingCues: ["Support the free hand securely", "Keep hips and shoulders steady", "Pull the elbow towards the hip"],
    equipmentAlternatives: ["Cable", "Resistance band", "Single-arm machine row"]
  },
  "chest-supported-row": {
    description: "A horizontal rowing movement performed with the chest supported on a bench or machine to reduce torso movement.",
    aliases: ["incline bench row", "chest supported dumbbell row"],
    coachingCues: ["Keep the chest in contact with the pad", "Pull elbows back without shrugging", "Lower until the arms reach a comfortable stretch"],
    equipmentAlternatives: ["Machine row", "Cable row"]
  },
  "arnold-press": {
    description: "A dumbbell shoulder press that rotates the hands during the press, combining shoulder flexion and pressing.",
    aliases: ["Arnold dumbbell press"],
    coachingCues: ["Use a controlled rotation", "Keep the ribcage stacked over the pelvis", "Choose a load that allows smooth movement"],
    equipmentAlternatives: ["Dumbbell shoulder press", "Machine shoulder press"]
  },
  "front-raise": {
    description: "A shoulder isolation movement that raises a weight in front of the body to emphasise the anterior deltoids.",
    aliases: ["dumbbell front raise", "DB front raise"],
    coachingCues: ["Raise only as high as you can control", "Keep the torso still", "Avoid swinging the weight"],
    equipmentAlternatives: ["Cable", "Weight plate", "Resistance band"]
  },
  "leg-extension": {
    description: "A machine-based knee-extension exercise that isolates the quadriceps while the torso and thighs remain supported.",
    aliases: ["knee extension machine"],
    coachingCues: ["Align the machine pivot with the knee", "Extend smoothly", "Lower without letting the weight stack drop"],
    equipmentAlternatives: ["Resistance band knee extension"]
  },
  "bulgarian-split-squat": {
    description: "A split-squat variation with the rear foot elevated, challenging the front leg's quadriceps and glutes.",
    aliases: ["rear-foot-elevated split squat", "RFESS"],
    coachingCues: ["Choose a stable rear-foot support", "Keep the front foot planted", "Lower under control without bouncing off the back leg"],
    equipmentAlternatives: ["Dumbbell", "Smith machine", "Bodyweight split squat"]
  },
  "step-up": {
    description: "A unilateral lower-body exercise in which one foot steps onto a raised platform and drives the body to standing.",
    aliases: ["dumbbell step-up", "box step-up"],
    coachingCues: ["Use a platform you can control", "Drive through the working foot", "Lower slowly rather than dropping down"],
    equipmentAlternatives: ["Bodyweight", "Dumbbell", "Smith machine"]
  },
  "sumo-squat": {
    description: "A squat variation using a wider stance and turned-out toes, training the quadriceps, glutes and hip adductors.",
    aliases: ["wide-stance squat"],
    coachingCues: ["Set a stance that suits your hips", "Keep knees tracking with the toes", "Maintain pressure across the whole foot"],
    equipmentAlternatives: ["Dumbbell", "Kettlebell", "Barbell"]
  }
};

 
// The remaining catalogue movements receive the same movement-specific guide
// fields. Keep the wording practical and distinguish similar variations.
Object.assign(exerciseGuides, {
  "back-extension": { description: "A hip-hinge or trunk-extension exercise performed on a back-extension bench to train the spinal erectors, glutes and hamstrings.", aliases: ["hyperextension", "45-degree back extension"], coachingCues: ["Set the pad below the hip crease", "Move through the hips without overextending the spine", "Raise until the torso is in line with the legs"], equipmentAlternatives: ["Floor hip extension", "Stability-ball extension"] },
  "hip-abduction": { description: "A seated machine movement that drives the thighs outwards against resistance, loading the gluteus medius and minimus.", aliases: ["machine hip abduction", "outer thigh machine"], coachingCues: ["Keep the pelvis steady against the seat", "Move the knees apart without bouncing", "Return slowly against the weight"], equipmentAlternatives: ["Cable standing abduction", "Resistance-band lateral walk"] },
  "hip-adduction": { description: "A seated machine exercise that brings the thighs towards the midline to train the hip adductors.", aliases: ["machine hip adduction", "inner thigh machine"], coachingCues: ["Keep the back supported", "Bring the pads together smoothly", "Control the outward return"], equipmentAlternatives: ["Cable hip adduction", "Side-lying adduction"] },
  "seated-calf-raise": { description: "A bent-knee calf raise that places greater emphasis on the soleus as the heels lift against a seated pad.", aliases: ["seated calf machine"], coachingCues: ["Keep the balls of the feet supported", "Lift through the full comfortable range", "Pause briefly before lowering the heels"], equipmentAlternatives: ["Dumbbell seated calf raise", "Bent-knee calf raise with plates"] },
  "tibialis-raise": { description: "A dorsiflexion exercise that lifts the front of the foot towards the shin to strengthen the tibialis anterior.", aliases: ["tibialis raise", "toe raise"], coachingCues: ["Keep the heels planted", "Lift the toes rather than rocking the whole body", "Lower slowly"], equipmentAlternatives: ["Tib bar", "Resistance-band dorsiflexion"] },
  "hanging-knee-raise": { description: "A hanging trunk exercise that raises bent knees towards the torso while the shoulders and core control swinging.", aliases: ["captain's chair knee raise", "hanging bent-knee raise"], coachingCues: ["Start from a controlled hang", "Curl the pelvis towards the ribs at the top", "Avoid using momentum to swing the legs"], equipmentAlternatives: ["Captain's chair", "Lying reverse crunch"] },
  "cable-crunch": { description: "A kneeling abdominal exercise that flexes the trunk against a high cable while the hips remain relatively fixed.", aliases: ["kneeling rope crunch", "rope crunch"], coachingCues: ["Keep the hips over the knees", "Bring the ribs towards the pelvis", "Do not turn it into an arm pulldown"], equipmentAlternatives: ["Weighted floor crunch", "Resistance-band crunch"] },
  "bicycle-crunch": { description: "A supine abdominal exercise alternating trunk rotation and opposite knee drive to challenge the obliques and rectus abdominis.", aliases: ["bicycle abs", "air bike crunch"], coachingCues: ["Rotate the rib cage rather than pulling the elbow", "Keep the neck relaxed", "Move at a pace you can control"], equipmentAlternatives: ["Dead bug", "Heel-tap crunch"] },
  "burpee": { description: "A full-body conditioning sequence combining a squat-to-floor transition, plank position and return to standing, with an optional jump.", aliases: ["burpees"], coachingCues: ["Brace before stepping or jumping back", "Keep the landing controlled", "Use a step-back version to reduce impact"], equipmentAlternatives: ["Step-back burpee", "Squat thrust"] },
  "high-knees": { description: "A running-in-place drill that alternates quick knee drives to raise heart rate and practise rhythmic foot contacts.", aliases: ["high knee run", "running high knees"], coachingCues: ["Stay tall through the torso", "Drive the arms naturally", "Land lightly beneath the hips"], equipmentAlternatives: ["Marching high knees", "Low-impact fast march"] },
  "mountain-climber-cross-body": { description: "A plank-based conditioning variation that drives each knee towards the opposite elbow, adding trunk rotation to the movement.", aliases: ["cross-body mountain climbers", "cross climber"], coachingCues: ["Keep shoulders stacked over wrists", "Bring the knee across without twisting the whole pelvis", "Limit hip bounce"], equipmentAlternatives: ["Slow cross-body step-in", "Standing cross-body knee drive"] },
  "wall-sit": { description: "An isometric squat hold performed with the back against a wall, challenging the quadriceps without repeated knee movement.", aliases: ["wall squat", "wall squat hold"], coachingCues: ["Keep the back in contact with the wall", "Set a knee angle you can hold comfortably", "Keep the feet flat and breathe steadily"], equipmentAlternatives: ["Supported squat hold", "Spanish squat hold"] },
  "bird-dog": { description: "A quadruped core-stability drill that extends the opposite arm and leg while resisting rotation through the pelvis and trunk.", aliases: ["bird dog exercise", "quadruped reach"], coachingCues: ["Keep the belt line facing the floor", "Reach long rather than lifting high", "Move slowly without arching the back"], equipmentAlternatives: ["Quadruped leg reach", "Dead bug"] },
  "incline-barbell-bench-press": { description: "A barbell chest press performed on an inclined bench, shifting the pressing angle towards the upper portion of the pectorals.", aliases: ["incline bench press", "incline barbell press"], coachingCues: ["Use a modest bench angle", "Lower towards the upper chest", "Keep the shoulder blades supported"], equipmentAlternatives: ["Incline dumbbell press", "Smith machine incline press"] },
  "decline-bench-press": { description: "A barbell press performed on a declined bench, using a downward pressing angle to train the chest and triceps.", aliases: ["decline barbell press", "decline press"], coachingCues: ["Secure your feet before unracking", "Lower under control towards the lower chest", "Keep wrists stacked over elbows"], equipmentAlternatives: ["Decline dumbbell press", "Chest press machine"] },
  "dumbbell-pullover": { description: "A lying shoulder-extension movement that arcs a dumbbell behind the head and back over the chest, involving the lats and chest.", aliases: ["DB pullover", "lying dumbbell pullover"], coachingCues: ["Keep a soft bend in the elbows", "Use a range your shoulders control comfortably", "Keep the ribs from flaring as the weight travels back"], equipmentAlternatives: ["Cable pullover", "Straight-arm pulldown"] },
  "pec-deck-fly": { description: "A machine chest-fly exercise that brings the upper arms together in front of the torso along a guided arc.", aliases: ["pec deck", "machine chest fly"], coachingCues: ["Set the seat so the handles align with the chest", "Keep the shoulders down and supported", "Avoid bouncing at the stretched position"], equipmentAlternatives: ["Cable fly", "Dumbbell chest fly"] },
  "neutral-grip-lat-pulldown": { description: "A vertical cable pull using parallel handles, bringing the elbows down while maintaining a neutral hand position.", aliases: ["close neutral-grip pulldown", "parallel-grip lat pulldown"], coachingCues: ["Keep the torso mostly upright", "Drive elbows down towards the sides", "Allow a controlled stretch at the top"], equipmentAlternatives: ["Neutral-grip assisted pull-up", "Resistance-band pulldown"] },
  "straight-arm-pulldown": { description: "A cable shoulder-extension exercise that moves a bar from shoulder height towards the thighs while the elbows stay softly bent.", aliases: ["straight-arm cable pulldown", "lat prayer"], coachingCues: ["Keep the elbows softly unlocked", "Move from the shoulders rather than bending the elbows", "Avoid rocking the torso"], equipmentAlternatives: ["Resistance-band straight-arm pulldown", "Dumbbell pullover"] },
  "chest-supported-t-bar-row": { description: "A supported horizontal row using a T-bar machine, allowing the back to work with reduced lower-back and hip movement.", aliases: ["T-bar chest-supported row", "supported T-bar row"], coachingCues: ["Keep the chest against the pad", "Pull towards the lower ribs", "Lower without letting the shoulders collapse forwards"], equipmentAlternatives: ["Chest-supported dumbbell row", "Supported machine row"] },
  "preacher-curl": { description: "An elbow-flexion exercise with the upper arms supported on a sloped pad to limit shoulder movement during the curl.", aliases: ["preacher biceps curl", "EZ-bar preacher curl"], coachingCues: ["Keep the upper arms on the pad", "Avoid bouncing out of the bottom", "Stop short of forcing the elbows into lockout"], equipmentAlternatives: ["Dumbbell preacher curl", "Single-arm cable curl"] },
  "concentration-curl": { description: "A seated single-arm dumbbell curl with the upper arm braced against the inner thigh to reduce body movement.", aliases: ["seated concentration curl"], coachingCues: ["Keep the upper arm supported", "Curl without rotating the torso", "Lower through a controlled range"], equipmentAlternatives: ["Single-arm cable curl", "Supported dumbbell curl"] },
  "cable-biceps-curl": { description: "An elbow-flexion exercise using a low cable to provide resistance throughout the curl.", aliases: ["standing cable curl", "low cable biceps curl"], coachingCues: ["Keep elbows near the torso", "Avoid leaning backwards", "Lower until the arms are comfortably extended"], equipmentAlternatives: ["Dumbbell curl", "Resistance-band curl"] },
  "skull-crusher": { description: "A lying triceps extension that bends and straightens the elbows while the upper arms remain angled above the shoulders.", aliases: ["EZ-bar skull crusher", "lying triceps extension"], coachingCues: ["Keep upper arms relatively still", "Lower the bar under control", "Use a comfortable path around the head"], equipmentAlternatives: ["Dumbbell lying extension", "Cable overhead extension"] },
  "cable-lateral-raise": { description: "A single-arm shoulder-abduction exercise using a low cable to load the lateral deltoid through the raising arc.", aliases: ["single-arm cable raise", "low cable lateral raise"], coachingCues: ["Stand tall with the cable crossing in front of the body", "Lead with the elbow", "Stop at a height you can control without shrugging"], equipmentAlternatives: ["Dumbbell lateral raise", "Resistance-band lateral raise"] },
  "landmine-press": { description: "An angled pressing exercise that drives one end of a barbell forwards and upwards, combining shoulder and upper-chest work with trunk stability.", aliases: ["landmine shoulder press", "half-kneeling landmine press"], coachingCues: ["Keep the ribs stacked over the pelvis", "Press along the bar's natural arc", "Resist leaning away from the bar"], equipmentAlternatives: ["Single-arm cable press", "Half-kneeling dumbbell press"] },
  "front-squat": { description: "A barbell squat with the load held across the front shoulders, encouraging an upright torso and substantial quadriceps contribution.", aliases: ["barbell front squat"], coachingCues: ["Keep elbows lifted", "Brace before descending", "Maintain balanced pressure across the feet"], equipmentAlternatives: ["Goblet squat", "Double-dumbbell front squat"] },
  "hack-squat": { description: "A machine-guided squat with the torso supported against a back pad, primarily loading the quadriceps.", aliases: ["hack squat machine"], coachingCues: ["Keep the back against the pad", "Lower only through a controlled range", "Drive evenly through both feet"], equipmentAlternatives: ["Leg press", "Front squat", "Goblet squat"] },
  "good-morning": { description: "A barbell hip hinge performed with the load across the upper back, training the spinal erectors, hamstrings and glutes.", aliases: ["barbell good morning"], coachingCues: ["Start with a manageable load", "Push the hips backwards with soft knees", "Keep the spine neutral and stop before position changes"], equipmentAlternatives: ["Dumbbell Romanian deadlift", "Cable pull-through"] },
  "single-leg-romanian-deadlift": { description: "A unilateral hip hinge performed on one leg, loading the hamstrings and glutes while challenging balance and pelvic control.", aliases: ["single-leg RDL", "one-leg Romanian deadlift"], coachingCues: ["Keep hips facing the floor", "Reach the free leg back as the torso hinges", "Use a support if balance limits the hinge"], equipmentAlternatives: ["Bodyweight single-leg hinge", "Kickstand RDL"] },
  "reverse-lunge": { description: "A single-leg squat variation in which one foot steps backwards before both knees bend, training the front leg's quadriceps and glutes.", aliases: ["backward lunge", "reverse lunges"], coachingCues: ["Step back far enough to stay balanced", "Keep the front foot fully grounded", "Push through the front leg to return"], equipmentAlternatives: ["Dumbbell reverse lunge", "Split squat"] },
  "walking-lunge": { description: "A travelling lunge in which each controlled step flows into the next, training the legs one side at a time.", aliases: ["walking lunges", "dumbbell walking lunge"], coachingCues: ["Choose a stride you can control", "Keep the front knee tracking with the foot", "Stand through the front leg before taking the next step"], equipmentAlternatives: ["Reverse lunge", "Static split squat"] },
  "cable-woodchop": { description: "A cable-resisted diagonal trunk rotation that moves the hands across the body while the hips and feet provide a stable base.", aliases: ["woodchop", "high-to-low cable chop"], coachingCues: ["Rotate through the trunk in a controlled range", "Keep the arms connected to the torso", "Avoid twisting forcefully through the lower back"], equipmentAlternatives: ["Resistance-band chop", "Medicine-ball rotational throw"] },
  "reverse-crunch": { description: "A supine abdominal exercise that curls the pelvis towards the rib cage by lifting the hips slightly from the floor.", aliases: ["reverse abdominal crunch"], coachingCues: ["Initiate by curling the pelvis", "Avoid swinging the knees towards the face", "Lower slowly without arching the back"], equipmentAlternatives: ["Bent-knee leg raise", "Dead bug"] },
  "hollow-body-hold": { description: "An isometric anti-extension core hold with the shoulders and legs lifted while the trunk resists the lower back arching.", aliases: ["hollow hold", "gymnastics hollow hold"], coachingCues: ["Keep the lower back supported against the floor", "Reach the arms and legs away only as far as control allows", "Keep breathing during the hold"], equipmentAlternatives: ["Tuck hollow hold", "Dead bug hold"] },
  "farmer-carry": { description: "A loaded carry performed while walking with weights at the sides, challenging grip, upper-back endurance and trunk stability.", aliases: ["farmer's walk", "farmers carry"], coachingCues: ["Stand tall without shrugging", "Take steady controlled steps", "Keep the weights close to the sides"], equipmentAlternatives: ["Kettlebell carry", "Suitcase carry", "Trap-bar carry"] },
  "incline-push-up": { description: "A push-up performed with the hands on a raised stable surface, reducing the proportion of bodyweight being pressed.", aliases: ["elevated push-up", "bench push-up"], coachingCues: ["Keep the body in one line", "Lower the chest towards the support", "Choose a height that allows controlled repetitions"], equipmentAlternatives: ["Wall push-up", "Knee push-up"] },
  "close-grip-push-up": { description: "A push-up with the hands set narrower beneath the chest, increasing the triceps contribution while retaining a horizontal press.", aliases: ["narrow push-up", "diamond push-up"], coachingCues: ["Keep hands at a comfortable narrow width", "Track elbows close to the torso", "Brace the hips and ribs together"], equipmentAlternatives: ["Incline close-grip push-up", "Cable triceps press"] },
  "dumbbell-floor-press": { description: "A dumbbell chest press performed lying on the floor, where the upper arms meet the floor to limit the bottom range.", aliases: ["floor dumbbell press", "DB floor press"], coachingCues: ["Keep wrists stacked over elbows", "Lower until upper arms touch softly", "Press without bouncing elbows off the floor"], equipmentAlternatives: ["Barbell floor press", "Bench press"] },
  "standing-cable-chest-press": { description: "A standing horizontal cable press that trains the chest while requiring the trunk to resist the pull of the cables.", aliases: ["standing cable press", "cable chest press"], coachingCues: ["Use a staggered stance", "Keep ribs down as the handles press forwards", "Return slowly without letting the shoulders roll forwards"], equipmentAlternatives: ["Resistance-band chest press", "Dumbbell bench press"] },
  "assisted-pull-up": { description: "A vertical pull performed with counterweight assistance to reduce the load while practising the pull-up movement.", aliases: ["machine-assisted pull-up"], coachingCues: ["Use only enough assistance to keep reps controlled", "Begin from an active shoulder position", "Lower smoothly rather than dropping"], equipmentAlternatives: ["Resistance-band assisted pull-up", "Lat pulldown"] },
  "inverted-row": { description: "A horizontal bodyweight row performed beneath a fixed bar, pulling the chest towards the bar while the body stays aligned.", aliases: ["bodyweight row", "Australian pull-up"], coachingCues: ["Keep shoulders, hips and ankles aligned", "Pull the chest towards the bar", "Adjust difficulty by changing body angle"], equipmentAlternatives: ["Suspension-trainer row", "Seated cable row"] },
  "reverse-grip-lat-pulldown": { description: "A vertical cable pull using an underhand grip, bringing the bar towards the upper chest while training the lats and elbow flexors.", aliases: ["underhand lat pulldown", "supinated pulldown"], coachingCues: ["Keep wrists comfortable and straight", "Drive elbows down without leaning far back", "Control the overhead return"], equipmentAlternatives: ["Underhand resistance-band pulldown", "Assisted chin-up"] },
  "wide-grip-seated-row": { description: "A seated cable row using a wide handle to emphasise horizontal shoulder movement and the upper-back musculature.", aliases: ["wide-grip cable row", "wide seated row"], coachingCues: ["Sit tall with knees softly bent", "Pull towards the upper abdomen", "Avoid using a backward body swing"], equipmentAlternatives: ["Wide-grip machine row", "Chest-supported wide row"] },
  "spider-curl": { description: "A biceps curl performed chest-down on an incline bench, keeping the upper arms hanging vertically to limit body momentum.", aliases: ["incline spider curl"], coachingCues: ["Keep the chest supported", "Let the upper arms hang beneath the shoulders", "Curl without moving the elbows forwards"], equipmentAlternatives: ["Preacher curl", "Supported cable curl"] },
  "reverse-curl": { description: "An elbow-flexion exercise using an overhand grip, placing greater emphasis on the brachialis and forearm extensors than a supinated curl.", aliases: ["overhand curl", "pronated curl"], coachingCues: ["Keep knuckles facing upwards", "Use a lighter load than a standard curl", "Keep elbows close to the torso"], equipmentAlternatives: ["EZ-bar reverse curl", "Cable reverse curl"] },
  "zottman-curl": { description: "A dumbbell curl that uses a palms-up lift and a palms-down lowering phase to train the elbow flexors and forearms.", aliases: ["Zottman biceps curl"], coachingCues: ["Curl with palms facing forwards", "Rotate at the top without rushing", "Lower slowly with palms facing down"], equipmentAlternatives: ["Reverse curl", "Alternating dumbbell curl"] },
  "overhead-cable-triceps-extension": { description: "A cable elbow-extension exercise performed with the upper arms overhead, loading the triceps through a lengthened position.", aliases: ["cable overhead triceps extension", "overhead rope extension"], coachingCues: ["Keep upper arms pointing forwards and upwards", "Extend without flaring the ribs", "Allow a controlled stretch as elbows bend"], equipmentAlternatives: ["Dumbbell overhead extension", "Resistance-band overhead extension"] },
  "bench-dip": { description: "A bodyweight triceps-focused dip with the hands supported behind the body on a bench; shoulder range should remain comfortable.", aliases: ["bench dips", "triceps bench dip"], coachingCues: ["Keep the support stable", "Use a shallow range if the shoulders feel strained", "Press through the hands without bouncing"], equipmentAlternatives: ["Close-grip push-up", "Cable triceps pushdown"] },
  "sumo-deadlift": { description: "A barbell deadlift performed with a wide stance and turned-out toes, combining hip extension and leg drive with a shorter bar path for many lifters.", aliases: ["sumo barbell deadlift"], coachingCues: ["Set the bar over the mid-foot", "Brace before pushing the floor apart", "Keep the bar close and knees tracking with toes"], equipmentAlternatives: ["Trap-bar deadlift", "Conventional deadlift"] },
  "trap-bar-deadlift": { description: "A deadlift performed inside a hexagonal bar, allowing the hands to sit beside the body while the legs and hips extend together.", aliases: ["hex-bar deadlift", "hex bar deadlift"], coachingCues: ["Centre yourself inside the frame", "Brace before driving through the floor", "Stand tall without leaning back"], equipmentAlternatives: ["Dumbbell deadlift", "Kettlebell deadlift"] },
  "glute-kickback": { description: "A cable hip-extension exercise that moves one leg backwards against resistance while the pelvis and trunk stay stable.", aliases: ["cable kickback", "glute cable kickback"], coachingCues: ["Keep the pelvis facing forwards", "Move from the hip rather than arching the back", "Use a controlled return"], equipmentAlternatives: ["Resistance-band kickback", "Quadruped hip extension"] },
  "nordic-hamstring-curl": { description: "A demanding eccentric hamstring exercise in which the body lowers forwards from a kneeling position while the ankles are anchored.", aliases: ["Nordic curl", "Nordic hamstring exercise"], coachingCues: ["Secure the ankles firmly", "Keep hips extended as you lean forwards", "Use the hands to catch and assist the return"], equipmentAlternatives: ["Assisted Nordic curl", "Slider hamstring curl"] },
  "pallof-press": { description: "An anti-rotation core exercise that presses a cable or band away from the chest while resisting its sideways pull.", aliases: ["Pallof hold", "anti-rotation press"], coachingCues: ["Stand side-on to the anchor", "Keep hips and shoulders facing forwards", "Pause with arms extended without rotating"], equipmentAlternatives: ["Resistance-band Pallof press", "Half-kneeling Pallof press"] },
  "copenhagen-plank": { description: "A side-plank variation with the upper leg supported on a bench, challenging the hip adductors and lateral trunk.", aliases: ["Copenhagen side plank", "Copenhagen hold"], coachingCues: ["Keep the elbow beneath the shoulder", "Lift hips into a straight line", "Start with a bent-knee support if needed"], equipmentAlternatives: ["Short-lever Copenhagen plank", "Side-lying hip adduction"] },
  "hanging-leg-raise": { description: "A hanging abdominal movement that raises the legs in front of the body while controlling pelvic position and swing.", aliases: ["straight-leg hanging raise", "hanging straight-leg raise"], coachingCues: ["Start from a stable hang", "Raise only as high as you can avoid swinging", "Lower slowly while keeping shoulders engaged"], equipmentAlternatives: ["Hanging knee raise", "Captain's chair leg raise"] }
});

for (const exercise of exercises) {
  const guide = exerciseGuides[exercise.slug];
  if (guide) Object.assign(exercise, guide);
}

/**
 * Fail before any database writes if catalogue data is internally inconsistent.
 * Stable unique slugs and resolvable muscle links are required because both are
 * used as identifiers by the API, filters, analytics and anatomy interface.
 */
function hasNonEmptyStrings(values, minimum = 1) {
  return Array.isArray(values) &&
    values.length >= minimum &&
    values.every((value) => typeof value === "string" && value.trim().length > 0);
}

function hasUniqueStrings(values) {
  if (!hasNonEmptyStrings(values)) return false;
  const normalised = values.map((value) => value.trim().toLocaleLowerCase("en-GB"));
  return new Set(normalised).size === normalised.length;
}

function hasUsefulDescription(value) {
  return typeof value === "string" && value.trim().length >= 60;
}

function validateGuideContent(slug, guide, label = "Exercise") {
  if (!hasUsefulDescription(guide.description) ||
      !hasUniqueStrings(guide.aliases) ||
      !hasNonEmptyStrings(guide.coachingCues, 3) ||
      !hasUniqueStrings(guide.coachingCues) ||
      !hasNonEmptyStrings(guide.equipmentAlternatives) ||
      !hasUniqueStrings(guide.equipmentAlternatives)) {
    throw new Error(`${label} ${slug} needs a 60-character description, non-empty unique aliases, three unique coaching cues and non-empty unique equipment alternatives.`);
  }
}

function validateCatalogue() {
  const muscleSlugs = new Set(muscles.map(([slug]) => slug));
  if (muscleSlugs.size !== muscles.length) {
    throw new Error("The muscle catalogue contains duplicate slugs.");
  }

  const exerciseSlugs = new Set();
  for (const exercise of exercises) {
    if (exerciseSlugs.has(exercise.slug)) {
      throw new Error(`Duplicate exercise slug: ${exercise.slug}`);
    }
    exerciseSlugs.add(exercise.slug);

    if (!hasNonEmptyStrings(exercise.primary) ||
        !Array.isArray(exercise.secondary) ||
        exercise.secondary.some((slug) => typeof slug !== "string" || !slug.trim())) {
      throw new Error(`Exercise ${exercise.slug} must have valid primary and secondary muscle slug arrays, including at least one primary muscle.`);
    }

    const linkedSlugs = [...exercise.primary, ...exercise.secondary];
    if (new Set(linkedSlugs).size !== linkedSlugs.length) {
      throw new Error(`Exercise ${exercise.slug} links the same muscle more than once.`);
    }

    for (const muscleSlug of linkedSlugs) {
      if (!muscleSlugs.has(muscleSlug)) {
        throw new Error(`Exercise ${exercise.slug} references unknown muscle ${muscleSlug}.`);
      }
    }
  }

  // Every catalogue movement must have a guide, not just every guide entry
  // point at a valid movement. This prevents new exercises being added without
  // searchable technique content.
  for (const exercise of exercises) {
    if (!exerciseGuides[exercise.slug]) {
      throw new Error(`Exercise ${exercise.slug} is missing its guide entry.`);
    }
    if (!hasNonEmptyStrings(exercise.instructions, 3)) {
      throw new Error(`Exercise ${exercise.slug} needs at least three non-empty string technique steps.`);
    }
    validateGuideContent(exercise.slug, exercise);
  }

  // Guide entries are keyed by the same stable slugs as catalogue rows. Catch
  // spelling drift before a seed run silently leaves an exercise without its
  // intended technique content.
  for (const [slug, guide] of Object.entries(exerciseGuides)) {
    if (!exerciseSlugs.has(slug)) {
      throw new Error(`Exercise guide references unknown exercise ${slug}.`);
    }
    validateGuideContent(slug, guide, "Exercise guide");
  }

  // Every canonical muscle should be represented in at least one movement so
  // the anatomy map never advertises a muscle the exercise catalogue cannot target.
  const usedMuscleSlugs = new Set(exercises.flatMap((exercise) => [...exercise.primary, ...exercise.secondary]));
  for (const [muscleSlug] of muscles) {
    if (!usedMuscleSlugs.has(muscleSlug)) {
      throw new Error(`Canonical muscle ${muscleSlug} is not linked to any exercise.`);
    }
  }
}

validateCatalogue();

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
