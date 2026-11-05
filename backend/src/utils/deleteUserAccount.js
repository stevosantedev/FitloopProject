/**
 * Delete an account and its owned training data in dependency order.
 *
 * Workout sets intentionally restrict exercise deletion so historical records
 * cannot point at missing movements. Account deletion therefore removes the
 * owner's sessions and routines before their private custom exercise records.
 * All steps share one transaction: a failure rolls back the whole deletion.
 */
export async function deleteUserAccount(prismaClient, userId) {
  await prismaClient.$transaction(async (transaction) => {
    await transaction.workoutSession.deleteMany({ where: { userId } });
    await transaction.workoutRoutine.deleteMany({ where: { userId } });
    await transaction.exercise.deleteMany({ where: { ownerId: userId, isCustom: true } });
    // Daily logs, social records, coaching data and preferences cascade from the user.
    await transaction.user.delete({ where: { id: userId } });
  });
}
