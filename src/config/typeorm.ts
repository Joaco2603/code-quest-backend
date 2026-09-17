import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.js';
export default new DataSource(databaseOptions());
