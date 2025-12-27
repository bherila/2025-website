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

    public function addRsuGrants(Request $request)
    {
        $user = Auth::user();
        $grants = $request->json()->all();

        foreach ($grants as $grant) {
            DB::table('fin_equity_awards')->updateOrInsert(
                [
                    'uid' => $user->id,
                    'award_id' => $grant['award_id'],
                    'grant_date' => $grant['grant_date'],
                    'vest_date' => $grant['vest_date'],
                    'symbol' => $grant['symbol'],
                ],
                [
                    'share_count' => $grant['share_count']['value'],
                    'grant_price' => $grant['grant_price'] ?? null,
                    'vest_price' => $grant['vest_price'] ?? null,
                ]
            );
        }

        return response()->json(['status' => 'success']);
    }
}
