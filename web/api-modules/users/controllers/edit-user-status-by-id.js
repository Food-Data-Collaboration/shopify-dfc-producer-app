import { query } from '../../../database/connect.js';

const editUserStatusById = async (req, res, next) => {
  const { id: userId } = req.params;
  const { shopName } = req;

  if (!userId) {
    return res.status(400).json({
      message: 'User id not provided',
      error: 'No user id provided'
    });
  }

  try {
    await query('UPDATE users SET status = NOT status WHERE user_id = $1', [
      userId
    ], undefined, shopName);

    return res.status(200).json({
      message: 'User status updated successfully',
      success: true
    });
  } catch (err) {
    return next(err);
  }
};

export default editUserStatusById;
