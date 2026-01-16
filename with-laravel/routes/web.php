<?php

use App\Http\Controllers\DatabaseTestController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/db-test', DatabaseTestController::class);
