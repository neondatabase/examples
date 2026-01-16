<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class DatabaseTestController extends Controller
{
    /**
     * Display database connection test page.
     */
    public function __invoke(): View
    {
        try {
            $users = User::limit(10)->get();
            $dbName = DB::connection()->getDatabaseName();
            $driver = DB::connection()->getDriverName();
            
            return view('db-test', [
                'connected' => true,
                'database' => $dbName,
                'driver' => $driver,
                'users' => $users,
                'userCount' => User::count()
            ]);
        } catch (\Exception $e) {
            return view('db-test', [
                'connected' => false,
                'error' => $e->getMessage()
            ]);
        }
    }
}
