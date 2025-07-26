package com.neon.quickstart;

import io.github.cdimascio.dotenv.Dotenv;
import java.sql.*;

public class ReadData {
    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();
        String connString = dotenv.get("DATABASE_URL");

        try (Connection conn = DriverManager.getConnection(connString);
             Statement stmt = conn.createStatement()) {
            System.out.println("Connection established");
            String sql = "SELECT * FROM books ORDER BY publication_year;";
            try (ResultSet rs = stmt.executeQuery(sql)) {
                System.out.println("\n--- Book Library ---");
                while (rs.next()) {
                    System.out.printf("ID: %d, Title: %s, Author: %s, Year: %d, In Stock: %b%n",
                            rs.getInt("id"), rs.getString("title"), rs.getString("author"),
                            rs.getInt("publication_year"), rs.getBoolean("in_stock"));
                }
                System.out.println("--------------------\n");
            }
        } catch (Exception e) {
            System.out.println("Connection failed.");
            e.printStackTrace();
        }
    }
}