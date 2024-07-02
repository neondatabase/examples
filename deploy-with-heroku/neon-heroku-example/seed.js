import pkg from "pg";
const { Pool } = pkg;

// Make sure to replace this with your actual Neon database connection string
const connectionString =
  process.env.DATABASE_URL || "your_neon_connection_string_here";

const pool = new Pool({ connectionString });

const seedDatabase = async () => {
  try {
    // Create the music_albums table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS music_albums (
        album_id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        artist VARCHAR(255) NOT NULL
      );
    `);

    // Insert sample data
    await pool.query(`
      INSERT INTO music_albums (title, artist)
      VALUES
        ('Rumours', 'Fleetwood Mac'),
        ('Abbey Road', 'The Beatles'),
        ('Dark Side of the Moon', 'Pink Floyd'),
        ('Thriller', 'Michael Jackson');
    `);

    console.log("Database seeded successfully");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await pool.end();
  }
};

seedDatabase();
