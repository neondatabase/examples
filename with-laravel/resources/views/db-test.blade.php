<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Database Test - Laravel + Neon</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 font-sans antialiased">
    <div class="min-h-screen py-12 px-4">
        <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
            <h1 class="text-3xl font-bold text-blue-600 mb-6">Database Connection Test</h1>

            @if($connected)
                <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                    <p class="text-green-800 font-semibold">✓ Connected successfully to Neon Postgres</p>
                </div>

                <div class="space-y-3 mb-8">
                    <div class="flex items-center p-3 bg-gray-50 rounded">
                        <span class="font-semibold text-gray-600 w-32">Database:</span>
                        <span class="font-mono text-gray-900">{{ $database }}</span>
                    </div>
                    <div class="flex items-center p-3 bg-gray-50 rounded">
                        <span class="font-semibold text-gray-600 w-32">Driver:</span>
                        <span class="font-mono text-gray-900">{{ $driver }}</span>
                    </div>
                    <div class="flex items-center p-3 bg-gray-50 rounded">
                        <span class="font-semibold text-gray-600 w-32">Total Users:</span>
                        <span class="font-mono text-gray-900">{{ $userCount }}</span>
                    </div>
                </div>

                @if($users->count() > 0)
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">Sample Users</h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                @foreach($users as $user)
                                <tr class="hover:bg-gray-50 transition-colors">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ $user->id }}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ $user->name }}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ $user->email }}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ $user->created_at->diffForHumans() }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @else
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                        <p class="text-yellow-800">
                            No users found. Run <code class="bg-yellow-100 px-2 py-1 rounded text-sm">php artisan migrate --seed</code> to create sample data.
                        </p>
                    </div>
                @endif
            @else
                <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <p class="text-red-800 font-semibold mb-2">✗ Database connection failed</p>
                    <p class="text-red-700 text-sm mb-3">{{ $error }}</p>
                    <p class="text-red-600 text-sm">
                        Make sure you've set <code class="bg-red-100 px-2 py-1 rounded">DB_URL</code> in your <code class="bg-red-100 px-2 py-1 rounded">.env</code> file.
                    </p>
                </div>
            @endif

            <a href="/" class="inline-block mt-8 text-blue-600 hover:text-blue-800 hover:underline">← Back to home</a>
        </div>
    </div>
</body>
</html>
