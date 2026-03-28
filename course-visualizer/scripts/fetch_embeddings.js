#!/usr/bin/env node

/**
 * Fetches real embeddings for each course using OpenAI's API.
 * Usage:
 *    OPENAI_API_KEY=sk-... npm run fetch-embeddings
 *
 * Results are written to data/openai_embeddings.jsonl (one JSON object per line)
 * with shape: { courseCode, courseName, source, dimensions, embedding }.
 */

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const MODEL = 'text-embedding-3-large';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'openai_embeddings.jsonl');
const COURSES_PATH = path.join(__dirname, '..', 'courses.json');

const apiKey = process.env.OPENAI_API_KEY;

async function main() {
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY environment variable.');
    console.error('Run as: OPENAI_API_KEY=sk-... npm run fetch-embeddings');
    process.exit(1);
  }

  if (!fs.existsSync(COURSES_PATH)) {
    console.error(`Unable to find courses file at ${COURSES_PATH}`);
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
  const output = fs.createWriteStream(OUTPUT_PATH, { flags: 'w' });

  console.log(`Fetching embeddings for ${courses.length} courses...`);

  for (const [index, course] of courses.entries()) {
    const topicText = course.Key_Topics || course.Summary || course.Course_Name;
    const input = `${course.Course_Name} (${course.Course_Code})\nTopics: ${topicText}`;

    try {
      const response = await client.embeddings.create({
        model: MODEL,
        input
      });

      const { embedding } = response.data[0] || {};

      if (!embedding) {
        throw new Error('Missing embedding in response');
      }

      const record = {
        courseCode: course.Course_Code,
        courseName: course.Course_Name,
        source: 'key_topics',
        dimensions: embedding.length,
        embedding
      };

      output.write(`${JSON.stringify(record)}\n`);
      console.log(`[${index + 1}/${courses.length}] ${course.Course_Code} -> ${embedding.length} dims`);
    } catch (error) {
      console.error(`Failed on ${course.Course_Code}: ${error.message}`);
      console.error('Stopping early. Partial output kept.');
      output.end();
      process.exit(1);
    }
  }

  output.end();
  console.log(`Done. Saved embeddings to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
