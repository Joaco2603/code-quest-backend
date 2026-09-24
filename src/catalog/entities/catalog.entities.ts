import { Category } from './category.entity.js';
import { Course } from './course.entity.js';
import { Technology } from './technology.entity.js';

export { Category } from './category.entity.js';
export { Course } from './course.entity.js';
export { CourseStatus } from './course-status.enum.js';
export { SkillLevel } from './skill-level.enum.js';
export { Technology } from './technology.entity.js';

export const catalogEntities = [Course, Category, Technology];
