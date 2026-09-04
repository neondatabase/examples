import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:postgres/postgres.dart';
import 'package:with_flutter/todos_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");
  final url = Uri.parse(dotenv.get("DATABASE_URL"));

  final conn = await Connection.open(Endpoint(
    host: url.host,
    database: url.path.replaceAll("/", ""),
    username: url.userInfo.split(':')[0],
    password: url.userInfo.split(':')[1],
  ));

  runApp(MyApp(db: conn));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, required this.db});

  final Connection db;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter +  Neon 🚀',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: TodosPage(
        db: db,
      ),
    );
  }
}
