import { query } from '../../../database/connect.js';

const deleteUser = async (req, res, next) => {
  const { id: userId } = req.params;
  const { shopName } = req;

  if (!userId) {
    return res.status(400).json({
      message: 'User id not provided',
      error: 'No user id provided'
    });
  }

  try {
    await query('DELETE FROM users WHERE user_id = $1', [userId], undefined, shopName);

    return res.status(200).json({
      message: 'User deleted successfully',
      success: true
    });
  } catch (err) {
    return next(err);
  }
};

export default deleteUser;
