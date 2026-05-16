const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/auth');

// All task routes require a valid JWT
router.use(authenticateToken);

// ────────────────────────────────────────
// Helper: check if user is a member of the project
async function isProjectMember(projectId, userId) {
  const { rows } = await db.query(
    'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return rows.length > 0;
}

// ────────────────────────────────────────
// 1. Create a new task inside a project
//    Only project members can create tasks
router.post('/', async (req, res) => {
  try {
    const { projectId, title, description, assignedTo, dueDate } = req.body;
    const userId = req.user.id;

    if (!projectId || !title) {
      return res.status(400).json({ error: 'Project ID and title are required' });
    }

    // Check project membership
    if (!(await isProjectMember(projectId, userId))) {
      return res.status(403).json({ error: 'You are not a member of this project' });
    }

    // If assigning to someone, they must also be a project member
    if (assignedTo && !(await isProjectMember(projectId, assignedTo))) {
      return res.status(400).json({ error: 'Assigned user is not a member of this project' });
    }

    const { rows } = await db.query(`
      INSERT INTO tasks (project_id, title, description, status, assigned_to, created_by, due_date)
      VALUES ($1, $2, $3, 'todo', $4, $5, $6) RETURNING id
    `, [projectId, title, description || '', assignedTo || null, userId, dueDate || null]);

    res.status(201).json({ message: 'Task created', taskId: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 2. Get all tasks for a project (only project members)
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!(await isProjectMember(projectId, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get tasks with assignee name
    const { rows: tasks } = await db.query(`
      SELECT t.*, u.name AS assignee_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.project_id = $1
      ORDER BY t.due_date ASC, t.created_at DESC
    `, [projectId]);

    res.json({ tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 3. Get tasks assigned to the current user (across all projects)
router.get('/my', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: tasks } = await db.query(`
      SELECT t.*, p.name AS project_name, u.name AS assignee_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.assigned_to = $1
      ORDER BY t.due_date ASC
    `, [userId]);
    res.json({ tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 4. Get a single task (only if member of its project)
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const { rows } = await db.query(`
      SELECT t.*, p.name AS project_name, u.name AS assignee_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = $1
    `, [taskId]);
    const task = rows[0];

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!(await isProjectMember(task.project_id, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 5. Update task (status, assignment, title, description, due date)
//    Only project members can update (admin can restrict later)
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const { title, description, status, assignedTo, dueDate } = req.body;

    const { rows: taskRows } = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    const task = taskRows[0];
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!(await isProjectMember(task.project_id, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status if provided
    if (status && !['todo', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Allowed: todo, in-progress, done' });
    }
    // Validate assigned user if provided
    if (assignedTo && !(await isProjectMember(task.project_id, assignedTo))) {
      return res.status(400).json({ error: 'Assigned user is not a member of this project' });
    }

    const fields = [];
    const values = [];
    let paramIdx = 1;
    if (title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(title); }
    if (description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(description); }
    if (status) { fields.push(`status = $${paramIdx++}`); values.push(status); }
    if (assignedTo !== undefined) { fields.push(`assigned_to = $${paramIdx++}`); values.push(assignedTo); }
    if (dueDate !== undefined) { fields.push(`due_date = $${paramIdx++}`); values.push(dueDate); }
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (fields.length === 1) { // only updated_at
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(taskId);
    await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values);

    res.json({ message: 'Task updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 6. Delete task (any project member can delete for now)
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const { rows: taskRows } = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    const task = taskRows[0];
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!(await isProjectMember(task.project_id, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────
// 7. Get overdue tasks for a project (member only)
router.get('/project/:projectId/overdue', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (!(await isProjectMember(projectId, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rows: overdue } = await db.query(`
      SELECT t.*, u.name AS assignee_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.project_id = $1 AND t.status != 'done' AND t.due_date < CURRENT_DATE
      ORDER BY t.due_date ASC
    `, [projectId]);

    res.json({ overdue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;