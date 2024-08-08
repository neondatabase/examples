import 'dart:io';
import 'package:postgres/postgres.dart';

void main() async {
  final conn = await Connection.open(Endpoint(
    host: 'ep-...us-east-1.aws.neon.tech',
    database: 'neondb',
    username: 'neondb_owner',
    password: '...',
  ));
  final result = await conn.execute("SELECT * from playing_with_neon;");
  print(result);
  exit(0);
}
