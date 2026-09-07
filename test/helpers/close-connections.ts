import { closeAdminDataSource } from './admin-data-source';

/* The owner pool is shared across a file's suites, so it is closed once the
   file is done rather than by each suite. */
afterAll(async () => {
  await closeAdminDataSource();
});
