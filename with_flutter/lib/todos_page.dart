import 'package:flutter/material.dart';
import 'package:postgres/postgres.dart';

class TodosPage extends StatefulWidget {
  const TodosPage({super.key, required this.db});

  final Connection db;

  @override
  State<TodosPage> createState() => _TodosPageState();
}

class _TodosPageState extends State<TodosPage> {
  List<Map<String, dynamic>> todos = [];
  bool isLoading = true;
  String error = "";
  final TextEditingController todoController = TextEditingController();

  @override
  void initState() {
    super.initState();
    getTodos();
  }

  void showError(BuildContext context, String error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text("Error-$error"),
        backgroundColor: Colors.red,
      ),
    );
  }

  Future<void> createTables() async {
    await widget.db.execute(
        "CREATE TABLE IF NOT EXISTS todos (id SERIAL, text TEXT, done BOOLEAN DEFAULT false)");
    return;
  }

  void getTodos() async {
    try {
      await createTables();
      final res = await widget.db.execute("select * from todos order by done");

      todos = res
          .map((item) => {"id": item[0], "text": item[1], "done": item[2]})
          .toList();
      isLoading = false;
      setState(() {});
    } on Exception catch (e) {
      isLoading = false;
      error = e.toString();
      showError(context, error);
      setState(() {});
    }
  }

  void addTodo() async {
    try {
      final String todo = todoController.text.trim();

      if (todo.isNotEmpty) {
        await widget.db.execute(
          r"insert into todos(text) values($1)",
          parameters: [todoController.text],
        );
        todoController.clear();

        getTodos();
      }
    } on Exception catch (e) {
      showError(context, e.toString());
    }
  }

  void updateTodo(int id, bool val) async {
    try {
      await widget.db.execute(
        r"update todos set done = $1 where id=$2",
        parameters: [val, id],
      );
      getTodos();
    } on Exception catch (e) {
      showError(context, e.toString());
    }
  }

  void deleteTodo(int id) async {
    try {
      await widget.db.execute(
        r"delete from todos where id=$1",
        parameters: [id],
      );
      getTodos();
    } on Exception catch (e) {
      showError(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Flutter +  Neon 🚀"),
      ),
      body: buildBody(),
    );
  }

  Widget buildBody() {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    } else {
      return Column(
        children: [
          todos.isNotEmpty
              ? buildTodoList()
              : const Expanded(
                  child: Center(
                    child: Text("No Todos"),
                  ),
                ),
          buildAddTodoForm(),
        ],
      );
    }
  }

  Widget buildTodoList() {
    return Expanded(
      child: ListView.builder(
        shrinkWrap: true,
        itemCount: todos.length,
        itemBuilder: (_, i) {
          return ListTile(
            title: Text(todos[i]["text"]),
            leading: Checkbox(
              value: todos[i]["done"] ?? false,
              onChanged: (val) {
                updateTodo(todos[i]['id'], val!);
              },
            ),
            trailing: IconButton(
              onPressed: () => deleteTodo(todos[i]["id"]),
              icon: const Icon(Icons.delete),
            ),
          );
        },
      ),
    );
  }

  Widget buildAddTodoForm() {
    return Card(
      child: Row(
        children: [
          // Input Field
          Expanded(
            child: TextField(
              controller: todoController,
              decoration: const InputDecoration(
                hintText: 'Enter a task...',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Add Button
          ElevatedButton(
            onPressed: addTodo,
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
