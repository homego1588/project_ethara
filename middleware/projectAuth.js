const db = require('../db');

// Middleware: only admins of the project (from project_members) can proceed
async function requireProjectAdmin(req, res, next) {
  const projectId = req.params.projectId || req.body.projectId;
  const userId = req.user.id;  // from previous authenticateToken

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const { rows } = await db.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    const member = rows[0];

    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only project admins can perform this action.' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireProjectAdmin;