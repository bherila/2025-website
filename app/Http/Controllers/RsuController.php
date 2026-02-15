<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class RsuController extends Controller
{
    public function getRsuData(Request $request)
    {
        $user = Auth::user();
        $data = DB::table('fin_equity_awards as a')
            ->leftJoin('stock_quotes_daily as s', function ($join) {
                $join->on('a.symbol', '=', 's.c_symb')
                    ->whereRaw('s.c_date = (select max(c_date) from stock_quotes_daily where c_symb = a.symbol and c_date <= a.vest_date)');
            })
            ->where('a.uid', $user->id)
            ->select('a.*', 's.c_close as fetched_vest_price')
            ->get()
            ->map(function ($item) {
                if ($item->vest_price === null && $item->fetched_vest_price !== null) {
                    $item->vest_price = $item->fetched_vest_price;
                }
                unset($item->fetched_vest_price);
                if ($item->vest_price === null) {
                    unset($item->vest_price);
                }

                return $item;
            });

        return response()->json($data);
    }

    public function upsertRsuGrants(Request $request)
    {
        $user = Auth::user();
        $grants = $request->json()->all();

        foreach ($grants as $grant) {
            // Handle share_count which might be currency object or number
            $shareCount = isset($grant['share_count']['value']) 
                ? $grant['share_count']['value'] 
                : $grant['share_count'];

            // If id is provided, update the specific record
            if (isset($grant['id'])) {
                DB::table('fin_equity_awards')
                    ->where('id', $grant['id'])
                    ->where('uid', $user->id) // Ensure user can only update their own records
                    ->update([
                        'award_id' => $grant['award_id'],
                        'grant_date' => $grant['grant_date'],
                        'vest_date' => $grant['vest_date'],
                        'symbol' => $grant['symbol'],
                        'share_count' => $shareCount,
                        'grant_price' => $grant['grant_price'] ?? null,
                        'vest_price' => $grant['vest_price'] ?? null,
                    ]);
            } else {
                // Otherwise use updateOrInsert based on unique key
                DB::table('fin_equity_awards')->updateOrInsert(
                    [
                        'uid' => $user->id,
                        'award_id' => $grant['award_id'],
                        'grant_date' => $grant['grant_date'],
                        'vest_date' => $grant['vest_date'],
                        'symbol' => $grant['symbol'],
                    ],
                    [
                        'share_count' => $shareCount,
                        'grant_price' => $grant['grant_price'] ?? null,
                        'vest_price' => $grant['vest_price'] ?? null,
                    ]
                );
            }
        }

        return response()->json(['status' => 'success']);
    }

    public function deleteRsuGrant(Request $request, $id)
    {
        $user = Auth::user();
        
        $deleted = DB::table('fin_equity_awards')
            ->where('id', $id)
            ->where('uid', $user->id) // Ensure user can only delete their own records
            ->delete();

        if ($deleted) {
            return response()->json(['status' => 'success']);
        } else {
            return response()->json(['status' => 'error', 'message' => 'Record not found'], 404);
        }
    }
}
