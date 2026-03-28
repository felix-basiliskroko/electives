#!/usr/bin/env node

/**
 * Generates deterministic mock 3072-dimension embeddings for each course.
 * Useful for prototyping similarity workflows without calling the OpenAI API.
 */

const fs = require('fs');
const path = require('path');

const DIMENSIONS = 3072;
const TARGET_PATH = path.join(__dirname, '..', 'data', 'mock_embeddings.jsonl');
const COURSES_PATH = path.join(__dirname, '..', 'courses.json');

const courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = Math.imul(31, hash) + str.charCodeAt(i);
  }
  return hash >>> 0;
}

const lines = courses.map((course, index) => {
  const seed = hashString(course.Course_Code) ^ hashString(course.Course_Name) ^ index;
  const rand = mulberry32(seed);
  const embedding = Array.from({ length: DIMENSIONS }, () => Number(((rand() * 2) - 1).toFixed(6)));

  return JSON.stringify({
    courseCode: course.Course_Code,
    courseName: course.Course_Name,
    dimensions: DIMENSIONS,
    embedding
  });
});

fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
fs.writeFileSync(TARGET_PATH, `${lines.join('\n')}\n`, 'utf8');

console.log(`Wrote ${courses.length} embeddings to ${TARGET_PATH}`);
