package com.neon.quickstart;

import io.github.cdimascio.dotenv.Dotenv;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;

public class CreateTable {

    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();
        String connString = dotenv.get("DATABASE_URL");

        try (Connection conn = DriverManager.getConnection(connString)) {
            System.out.println("Connection established");

            try (Statement stmt = conn.createStatement()) {
                // Drop the table if it already exists
                stmt.execute("DROP TABLE IF EXISTS books;");
                System.out.println("Finished dropping table (if it existed).");

                // Create a new table
                stmt.execute("""
                    CREATE TABLE books (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        author VARCHAR(255),
                        publication_year INT,
                        in_stock BOOLEAN DEFAULT TRUE
                    );
                """);
                System.out.println("Finished creating table.");

                // Insert a single book record
                String insertOneSql = "INSERT INTO books (title, author, publication_year, in_stock) VALUES (?, ?, ?, ?);";
                try (PreparedStatement pstmt = conn.prepareStatement(insertOneSql)) {
                    pstmt.setString(1, "The Catcher in the Rye");
                    pstmt.setString(2, "J.D. Salinger");
                    pstmt.setInt(3, 1951);
                    pstmt.setBoolean(4, true);
                    pstmt.executeUpdate();
                    System.out.println("Inserted a single book.");
                }

                // Insert multiple books at once
                String insertManySql = "INSERT INTO books (title, author, publication_year, in_stock) VALUES (?, ?, ?, ?);";
                try (PreparedStatement pstmt = conn.prepareStatement(insertManySql)) {
                    Object[][] booksToInsert = {
                        {"The Hobbit", "J.R.R. Tolkien", 1937, true},
                        {"1984", "George Orwell", 1949, true},
                        {"Dune", "Frank Herbert", 1965, false}
                    };

                    for (Object[] book : booksToInsert) {
                        pstmt.setString(1, (String) book[0]);
                        pstmt.setString(2, (String) book[1]);
                        pstmt.setInt(3, (Integer) book[2]);
                        pstmt.setBoolean(4, (Boolean) book[3]);
                        pstmt.addBatch();
                    }
                    pstmt.executeBatch();
                    System.out.println("Inserted 3 rows of data.");
                }
            }
        } catch (Exception e) {
            System.out.println("Connection failed.");
            e.printStackTrace();
        }
    }
}