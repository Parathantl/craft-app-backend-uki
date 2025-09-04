# Craft Marketplace Backend API

A comprehensive backend API for a Sri Lankan crafts selling platform built with Node.js, Express, and MongoDB.

## Features

- **User Authentication & Authorization**
  - User registration (Creators & Customers)
  - Email verification
  - JWT-based authentication
  - Role-based access control

- **Product Management**
  - CRUD operations for products
  - Image upload support
  - Category management
  - Stock management
  - Product search and filtering

- **Order Management**
  - Order creation (authenticated & guest users)
  - Order status tracking
  - Order history
  - Stock validation

- **Payment Integration**
  - PayHere payment gateway integration
  - Payment status tracking
  - Webhook handling
  - Refund processing

- **Admin Dashboard**
  - User management
  - Product management
  - Order management
  - Sales reports
  - Analytics

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT
- **File Upload**: Multer
- **Payment Gateway**: PayHere (Sri Lankan)
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud)
- PayHere merchant account (for payments)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd craft-app-backend-uki
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   - Database connection string
   - JWT secret key
   - Email credentials
   - PayHere credentials
   - Frontend URL

4. **Start MongoDB**
   ```bash
   # Local MongoDB
   mongod
   
   # Or use MongoDB Atlas (cloud)
   ```

5. **Run the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify-email/:token` - Email verification
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password

### Products
- `GET /api/products` - Get all products (public)
- `GET /api/products/:id` - Get single product (public)
- `POST /api/products` - Create product (creators)
- `PUT /api/products/:id` - Update product (creator/admin)
- `DELETE /api/products/:id` - Delete product (creator/admin)
- `GET /api/products/creator/my-products` - Get creator's products
- `PATCH /api/products/:id/toggle-status` - Toggle product status

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders/my-orders` - Get user's orders
- `GET /api/orders/:id` - Get single order
- `PATCH /api/orders/:id/status` - Update order status (admin)
- `PATCH /api/orders/:id/cancel` - Cancel order
- `GET /api/orders/admin/all` - Get all orders (admin)
- `GET /api/orders/admin/stats` - Order statistics (admin)

### Payments
- `POST /api/payments/initiate` - Initialize PayHere payment
- `POST /api/payments/webhook` - PayHere webhook
- `GET /api/payments/:paymentId/status` - Get payment status
- `GET /api/payments/my-payments` - Get user's payments
- `GET /api/payments/admin/all` - Get all payments (admin)
- `GET /api/payments/admin/stats` - Payment statistics (admin)
- `POST /api/payments/:paymentId/refund` - Refund payment (admin)

### Admin
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/users` - User management
- `PATCH /api/admin/users/:id/status` - Update user status
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/products` - Product management
- `PATCH /api/admin/products/:id/status` - Update product status
- `GET /api/admin/categories` - Category management
- `POST /api/admin/categories` - Create category
- `PUT /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category
- `GET /api/admin/reports/sales` - Sales reports

### Public
- `GET /api/categories` - Get all categories

## User Roles

1. **User (Customer)**
   - Browse products
   - Place orders
   - View order history
   - Manage profile

2. **Creator (Seller)**
   - All user permissions
   - Create/manage products
   - View sales/orders
   - Manage inventory

3. **Admin**
   - All permissions
   - User management
   - Product management
   - Order management
   - Payment management
   - Analytics & reports

## PayHere Integration

The app integrates with PayHere, a popular Sri Lankan payment gateway:

1. **Setup PayHere Account**
   - Register at [PayHere](https://www.payhere.lk/)
   - Get merchant ID and secret key
   - Configure webhook URL

2. **Environment Variables**
   ```env
   PAYHERE_MERCHANT_ID=your-merchant-id
   PAYHERE_SECRET_KEY=your-secret-key
   PAYHERE_SANDBOX_URL=https://sandbox.payhere.lk/pay/checkout
   ```

3. **Payment Flow**
   - User creates order
   - Payment is initiated via PayHere
   - User redirected to PayHere checkout
   - Payment processed
   - Webhook updates order status

## File Upload

Product images are stored locally in the `uploads/` directory:

- Supported formats: JPEG, JPG, PNG, WebP
- Maximum file size: 5MB
- Maximum files per product: 5

## Security Features

- JWT authentication
- Password hashing (bcrypt)
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation
- SQL injection prevention (MongoDB)

## Error Handling

The API includes comprehensive error handling:

- Validation errors
- Authentication errors
- Authorization errors
- Database errors
- File upload errors
- Payment processing errors

## Development

### Scripts
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

### Database Seeding
Create sample data for development:
```javascript
// Add to package.json scripts
"seed": "node scripts/seed.js"
```

## Production Deployment

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Use strong JWT secret
   - Configure production database
   - Set up email service
   - Configure PayHere live credentials

2. **Security**
   - Enable HTTPS
   - Set up proper CORS
   - Configure rate limiting
   - Set up monitoring

3. **File Storage**
   - Consider cloud storage (AWS S3, etc.)
   - Implement CDN for images

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## License

This project is licensed under the MIT License.

## Support

For support, email support@craftmarketplace.com or create an issue in the repository.
