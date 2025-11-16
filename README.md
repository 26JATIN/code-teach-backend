# Code-Teach Backend API

Backend API for the Code-Teach educational platform, built with Node.js, Express, and MongoDB.

## 🚀 Features

- **User Authentication**: JWT-based authentication with email verification
- **Course Management**: CRUD operations for courses and modules
- **Dynamic Module System**: Flexible content blocks for rich learning experiences
- **Progress Tracking**: Track user progress through courses
- **Admin Panel**: Administrative functions for content management
- **Email Service**: Automated email verification and password reset

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account or local MongoDB installation
- Gmail account (for email service) or SMTP server

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd code-teach-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your configuration:
   ```env
   # Database
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/codeteach?retryWrites=true&w=majority

   # JWT Secret (generate a secure random string)
   JWT_SECRET=your_super_secret_jwt_key_here

   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_specific_password

   # Admin Credentials
   ADMIN_USERNAME=admin
   ADMIN_EMAIL=admin@codeteach.com
   ADMIN_PASSWORD=secure_admin_password

   # Environment
   NODE_ENV=development
   PORT=5000
   ```

4. **Seed the database**
   ```bash
   # Seed courses
   npm run seed:courses

   # Seed modules (after courses are created)
   node seeds/moduleSeeder.js
   ```

## 🏃‍♂️ Running the Server

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:5000`

## 📁 Project Structure

```
code-teach-backend/
├── models/
│   ├── Course.js          # Course schema
│   ├── Module.js          # Dynamic module schema
│   ├── User.js            # User schema with enrollments
│   └── EmailVerification.js
├── routes/
│   ├── auth.js            # Authentication endpoints
│   ├── courses.js         # Course endpoints
│   ├── modules.js         # Module CRUD operations
│   ├── admin.js           # Admin operations
│   └── contact.js         # Contact form
├── middleware/
│   ├── auth.js            # JWT verification
│   └── adminAuth.js       # Admin authorization
├── utils/
│   ├── emailService.js    # Email sending utility
│   └── dbCleanup.js       # Database maintenance
├── seeds/
│   ├── courseSeeder.js    # Seed courses
│   └── moduleSeeder.js    # Seed modules
├── .env.example           # Example environment variables
├── server.js              # Main application file
└── package.json
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/verify-email` - Verify email with OTP
- `POST /auth/signin` - Login user
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with OTP

### Courses
- `GET /api/courses` - Get all published courses
- `POST /api/courses/enroll/:courseId` - Enroll in a course (auth required)
- `GET /api/courses/enrolled` - Get user's enrolled courses (auth required)
- `GET /api/courses/progress/:courseId` - Get course progress (auth required)

### Modules
- `GET /api/modules/course/:courseId` - Get all modules for a course
- `GET /api/modules/course/:courseId/module/:moduleId/submodule/:subModuleId` - Get specific submodule content
- `POST /api/modules/course/:courseId/module` - Create new module (admin)
- `PUT /api/modules/course/:courseId/module/:moduleId` - Update module (admin)
- `DELETE /api/modules/course/:courseId/module/:moduleId` - Delete module (admin)

For full API documentation, see [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)
