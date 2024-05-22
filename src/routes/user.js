const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const User = require('../models/User');

const router = express.Router();
const redisClient = redis.createClient();

// Middleware to check token
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).send('Access Denied');

    redisClient.get(token, (err, reply) => {
        if (err || !reply) {
            return res.status(403).send('Invalid or expired token');
        }
        req.user = JSON.parse(reply);
        next();
    });
};

// Register
router.post('/register', async (req, res) => {
    const { name, age, email, password, gender } = req.body;

    const emailExist = await User.findOne({ email });
    if (emailExist) return res.status(400).send('Email already exists');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ name, age, email, password: hashedPassword, gender });

    try {
        const savedUser = await user.save();
        res.send(savedUser);
    } catch (err) {
        res.status(400).send(err);
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).send('Email or password is wrong');

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).send('Invalid password');

    const token = jwt.sign({ _id: user._id }, 'secretkey', { expiresIn: '1h' });

    // Save the token in Redis with an expiration of 1 hour
    redisClient.setex(token, 3600, JSON.stringify({ _id: user._id }));

    res.header('Authorization', token).send({ token });
});

// Get user profile
router.get('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    redisClient.get(id, async (err, user) => {
        if (user) {
            return res.send(JSON.parse(user));
        } else {
            try {
                const user = await User.findById(id);
                if (!user) return res.status(404).send('User not found');
                
                redisClient.setex(id, 3600, JSON.stringify(user));
                res.send(user);
            } catch (err) {
                res.status(400).send(err);
            }
        }
    });
});

// Update user profile
router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, age, email, gender } = req.body;

    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).send('User not found');

        user.name = name;
        user.age = age;
        user.email = email;
        user.gender = gender;

        const updatedUser = await user.save();

        redisClient.setex(id, 3600, JSON.stringify(updatedUser));
        res.send(updatedUser);
    } catch (err) {
        res.status(400).send(err);
    }
});

// Delete user profile
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findByIdAndDelete(id);
        if (!user) return res.status(404).send('User not found');

        redisClient.del(id);
        res.send('User deleted');
    } catch (err) {
        res.status(400).send(err);
    }
});

module.exports = router;
