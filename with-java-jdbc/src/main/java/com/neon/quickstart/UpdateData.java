package com.neon.quickstart;

import io.github.cdimascio.dotenv.Dotenv;
import java.sql.*;

public class UpdateData {
    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();
        String connString = dotenv.get("DATABASE_URL");
        String sql = "UPDATE books SET in_stock = ? WHERE title = ?;";

        try (Connection conn = DriverManager.getConnection(connString);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            System.out.println("Connection established");
            pstmt.setBoolean(1, true);
            pstmt.setString(2, "Dune");
            int rowsAffected = pstmt.executeUpdate();
            if (rowsAffected > 0) {
                System.out.println("Updated stock status for 'Dune'.");
            }
        } catch (Exception e) {
            System.out.println("Connection failed.");
            e.printStackTrace();
        }
    }
}