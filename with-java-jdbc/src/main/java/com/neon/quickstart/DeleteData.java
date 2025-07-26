package com.neon.quickstart;

import io.github.cdimascio.dotenv.Dotenv;
import java.sql.*;

public class DeleteData {
    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();
        String connString = dotenv.get("DATABASE_URL");
        String sql = "DELETE FROM books WHERE title = ?;";

        try (Connection conn = DriverManager.getConnection(connString);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            System.out.println("Connection established");
            pstmt.setString(1, "1984");
            int rowsAffected = pstmt.executeUpdate();
            if (rowsAffected > 0) {
                System.out.println("Deleted the book '1984' from the table.");
            }
        } catch (Exception e) {
            System.out.println("Connection failed.");
            e.printStackTrace();
        }
    }
}