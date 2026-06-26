#!/usr/bin/env node
'use strict';

// dotenv loaded automatically by src/config/index.js
const ENV = (process.env.NODE_ENV || 'development').toLowerCase();

console.log(`[Start] NODE_ENV=${ENV}`);
require('../src/server');
