# Project Tracker

A full-stack project tracking application built with Node.js, Express, and an embedded PostgreSQL database (using PGLite).

## Features
- **User Authentication**: Secure sign up and login functionality using JWT and bcrypt.
- **Dashboard**: View and manage all your projects in one place.
- **Project Management**: Create new projects and invite team members.
- **Task Tracking**: Add, update, and track tasks within specific projects with a robust status workflow (To-Do, In Progress, Done).
- **Embedded Database**: Runs seamlessly out of the box using `@electric-sql/pglite`, a fully-compliant PostgreSQL database engine compiled to WebAssembly that persists data locally. No external database setup is required.

## Technologies Used
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (PGlite)
- **Frontend**: HTML, CSS, JavaScript
- **Security**: JWT (JSON Web Tokens), bcryptjs

## Running Locally

### Prerequisites
- Node.js installed on your machine.

### Installation Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/homego1588/project_ethara.git
   ```
2. Navigate into the project directory:
   ```bash
   cd project_ethara
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
   *(Alternatively, for development with auto-restart, run `npm run dev`)*

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Deployment
This project is configured to be easily deployed on cloud platforms like [Railway](https://railway.app/). Simply link this GitHub repository in Railway to deploy it automatically.
