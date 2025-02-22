const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ejsMate = require('ejs-mate');  // Fixed typo in ejs-mate import
const joi = require('joi');
const catchAsync = require('./utils/catchAsync');
const ExpressError = require('./utils/ExpressError');
const Campground = require('./models/campground');
const Review = require('./models/review');
const methodOverride = require('method-override');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/yelp-camp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => console.log('Database connected'));

const app = express();

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Schema definition for the campground validation
const campgroundSchema = joi.object({
    campground: joi.object({
        title: joi.string().regex(/^[a-zA-Z\s]+$/).required().messages({
            'string.empty': 'Title is required',
            'string.pattern.base': 'Title must contain only alphabetic characters',
        }),
        price: joi.number().required().min(0).messages({
            'number.base': 'Price must be a number',
            'number.min': 'Price must be greater than or equal to 0',
            'any.required': 'Price is required',
        }),
        image: joi.string().required().messages({
            'string.empty': 'Image URL is required',
        }),
        location: joi.string().regex(/^[a-zA-Z\s]+$/).required().messages({
            'string.empty': 'Location is required',
            'string.pattern.base': 'Location must contain only alphabetic characters',
        }),
        description: joi.string().regex(/^[a-zA-Z\s]+$/).required().messages({
            'string.empty': 'Description is required',
            'string.pattern.base': 'Description must contain only alphabetic characters',
        }),
    }).required(),
});

// Review Schema Validation
const reviewSchema = joi.object({
    body: joi.string().required().messages({
        'string.empty': 'Review text is required',
    }),
    rating: joi.number().required().min(1).max(5).messages({
        'number.base': 'Rating must be a number',
        'number.min': 'Rating must be at least 1',
        'number.max': 'Rating cannot exceed 5',
    }),
    author: joi.string().required().messages({
        'string.empty': 'Author name is required',
    }),
});

// Validation Middleware for Campgrounds
const validateCampground = (req, res, next) => {
    const { error } = campgroundSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((el) => el.message).join(', ');
        throw new ExpressError(msg, 400);
    }
    next();
};

// Validation Middleware for Reviews
const validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((el) => el.message).join(', ');
        throw new ExpressError(msg, 400);
    }
    next();
};

// Home Route
app.get('/', (req, res) => res.render('home'));

// Index Route: Show all campgrounds
app.get('/campgrounds', catchAsync(async (req, res) => {
    const campgrounds = await Campground.find({});
    res.render('campgrounds/index', { campgrounds });
}));

// New Route: Show form to create a new campground
app.get('/campgrounds/new', (req, res) => res.render('campgrounds/new'));

// Create Route: Add new campground to the database
app.post('/campgrounds', validateCampground, catchAsync(async (req, res) => {
    const campground = new Campground(req.body.campground);
    await campground.save();
    res.redirect(`/campgrounds/${campground._id}`);
}));

// Show Route: Show details for one campground
app.get('/campgrounds/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id).populate('reviews');
    if (!campground) {
        throw new ExpressError('Campground not found', 404);
    }
    res.render('campgrounds/show', { campground });
}));

// Edit Route: Show form to edit a campground
app.get('/campgrounds/:id/edit', catchAsync(async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    if (!campground) {
        throw new ExpressError('Campground not found', 404);
    }
    res.render('campgrounds/edit', { campground });
}));

// Update Route: Update campground details
app.put('/campgrounds/:id', validateCampground, catchAsync(async (req, res) => {
    const { id } = req.params;
    await Campground.findByIdAndUpdate(id, { ...req.body.campground });
    res.redirect(`/campgrounds/${id}`);
}));

// Delete Route: Delete a campground and its associated reviews
app.delete('/campgrounds/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    if (!campground) {
        throw new ExpressError('Campground not found', 404);
    }

    // This will trigger the pre('remove') hook and delete associated reviews
    await Campground.findByIdAndDelete(id);  // Use findByIdAndDelete instead of remove
    res.redirect('/campgrounds');
}));

// POST Route to Add Reviews for Campgrounds
app.post('/campgrounds/:id/reviews', validateReview, catchAsync(async (req, res) => {
    const { id } = req.params;
    const campground = await Campground.findById(id);
    if (!campground) {
        throw new ExpressError('Campground not found', 404);
    }

    const { body, rating, author } = req.body;
    const review = new Review({ body, rating, author });

    campground.reviews.push(review);

    await review.save();
    await campground.save();

    res.redirect(`/campgrounds/${id}`);
}));

// DELETE Route for Reviews
app.delete('/campgrounds/:id/reviews/:reviewId', catchAsync(async (req, res) => {
    const { id, reviewId } = req.params;
    await Campground.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    res.redirect(`/campgrounds/${id}`);
}));

// 404 Route: Catch all unmatched routes
app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404));
});

// Centralized Error-Handling Middleware
app.use((err, req, res, next) => {
    const { statusCode = 500, message = 'Something went wrong' } = err;
    res.status(statusCode).render('error', { statusCode, message });
});

// Start the server
app.listen(3000, () => console.log('Serving on port 3000'));
