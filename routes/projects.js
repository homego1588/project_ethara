const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const requireProjectAdmin = require('../middleware/projectAuth');

// All routes here require a valid token
router.use(authenticateToken);

// ────────────────────────────────────────
// 1. Create a new project
//    Automatically adds the creator as "admin" member
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const userId = req.user.id;

    const { rows } = await db.query(
      'INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, description || '', userId]
    );
    const projectId = rows[0].id;

    // Add creator as project admin
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [projectId, userId, 'admin']
    );

    res.status(201).json({ message: 'Project created', projectId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 2. Get all projects where the user is a member
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: projects } = await db.query(`
      SELECT p.id, p.name, p.description, p.created_by, p.created_at,
             pm.role AS member_role
      FROM projects p
      INNER JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = $1
      ORDER BY p.created_at DESC
    `, [userId]);
    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 3. Get a single project (only if member)
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const { rows } = await db.query(`
      SELECT p.id, p.name, p.description, p.created_by, p.created_at,
             pm.role AS member_role
      FROM projects p
      INNER JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = $1 AND pm.user_id = $2
    `, [projectId, userId]);
    
    const project = rows[0];

    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Get team members
    const { rows: members } = await db.query(`
      SELECT u.id, u.name, u.email, pm.role, pm.joined_at
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = $1
    `, [projectId]);

    res.json({ project, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 4. Update project (admin only)
router.put('/:projectId', requireProjectAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description } = req.body;

    if (!name && description === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const fields = [];
    const values = [];
    let paramIdx = 1;
    
    if (name) { 
      fields.push(`name = $${paramIdx++}`); 
      values.push(name); 
    }
    if (description !== undefined) { 
      fields.push(`description = $${paramIdx++}`); 
      values.push(description); 
    }
    values.push(projectId);

    await db.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values);
    res.json({ message: 'Project updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 5. Delete project (only creator, or leave as project admin)
router.delete('/:projectId', requireProjectAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;
    // Project members are deleted automatically (CASCADE)
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 6. Add a member to a project (admin only)
router.post('/:projectId/members', requireProjectAdmin, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const memberRole = role === 'admin' ? 'admin' : 'member';

    try {
      await db.query(
        'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
        [projectId, user.id, memberRole]
      );
      res.json({ message: 'Member added successfully' });
    } catch (err) {
      // Postgres unique constraint violation is 23505
      if (err.code === '23505') {
        return res.status(400).json({ error: 'User is already a member of this project' });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 7. Remove a member from a project (admin only)
router.delete('/:projectId/members/:userId', requireProjectAdmin, async (req, res) => {
  try {
    const { projectId, userId } = req.params;

    // Prevent removing the last admin? Optional, we'll just remove
    await db.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;