#[allow(implicit_const_copy)]
module spot_game::spot_game;

use sui::clock::{Clock, timestamp_ms};
use sui::coin::{Coin, value};
use sui::ecvrf::ecvrf_verify;
use sui::event;
use sui::sui::SUI;
use sui::table::{Self, Table};

// === Errors ===
const E_NOT_ADMIN: u64 = 1;
const E_ROUND_NOT_ACTIVE: u64 = 2;
const E_INVALID_PROOF: u64 = 4;
const E_INVALID_PICKS_LENGTH: u64 = 5;
const E_INVALID_PICKS: u64 = 6;
const E_INSUFFICIENT_FEE: u64 = 7;
const E_TIME_NOT_STARTED: u64 = 8;
const E_TIME_ENDED: u64 = 9;
const E_INSUFFICIENT_RUBY: u64 = 10;

// === Events ===
public struct GameCreated has copy, drop {
    game_id: ID,
    admin: address,
}
public struct RoundStarted has copy, drop {
    round_number: u64,
    start_time: u64,
    end_time: u64,
}
public struct BetPlaced has copy, drop {
    round_number: u64,
    player: address,
    picks: vector<u8>,
}
public struct RoundEnded has copy, drop {
    round_number: u64,
    winning: vector<u8>,
}

// === Constants ===
const MAX_NUM: u8 = 80;
const NUMBERS_TO_CHOOSE: u64 = 10;
const NUMBERS_TO_DRAW: u64 = 12;
const SUI_ENTRY_FEE: u64 = 100_000_000; // 0.1 SUI
const RUBY_ENTRY_FEE: u64 = 50; // 50 ruby
const ROUND_DURATION_MS: u64 = 10 * 60 * 1000; // 10 minutes

/// how many ruby each 1–10-match bucket contains
const POOLS: vector<u64> = vector[
    100, 500, 1_000, 5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000,
];

public struct Bet has copy, drop, store {
    player: address,
    picks: vector<u8>,
}

public struct Round has drop, store {
    start_time_ms: u64,
    end_time_ms: u64,
    bets: vector<Bet>,
}

public struct Game has key, store {
    id: UID,
    admin: address,
    vrf_pubkey: Option<vector<u8>>,
    round_number: u64,
    current_round: Option<Round>,
    ruby: Table<address, u64>,
    winning_numbers: Option<vector<u8>>,
}

fun init(ctx: &mut TxContext) {
    let admin = ctx.sender();

    let game = Game {
        id: object::new(ctx),
        admin: admin,
        vrf_pubkey: option::none(),
        round_number: 0,
        current_round: option::none(),
        ruby: table::new<address, u64>(ctx),
        winning_numbers: option::none(),
    };

    event::emit(GameCreated {
        game_id: object::id(&game),
        admin: admin,
    });

    transfer::share_object(game);
}

// Sets or rotates the VRF public key; only admin
public entry fun set_vrf_key(game: &mut Game, new_key: vector<u8>, ctx: &mut TxContext) {
    assert!(ctx.sender() == game.admin, E_NOT_ADMIN);
    game.vrf_pubkey = option::some(new_key);
}

public entry fun get_user_ruby(game: &mut Game, user: address): u64 {
    if (table::contains(&game.ruby, user)) {
        return *table::borrow(&game.ruby, user)
    } else {
        return 0
    }
}

public entry fun join_round_with_sui(
    picks: vector<u8>,
    payment: Coin<SUI>,
    game: &mut Game,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // common validations
    ensure_active_round(game, clock, picks);

    // SUI payment logic
    assert!(value(&payment) == SUI_ENTRY_FEE, E_INSUFFICIENT_FEE);
    transfer::public_transfer(payment, game.admin);

    // record
    join_round_record(picks, game, ctx);
}

public entry fun join_round_with_ruby(
    picks: vector<u8>,
    game: &mut Game,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // common validations
    ensure_active_round(game, clock, picks);

    // ruby payment logic
    let payer = ctx.sender();
    assert!(table::contains(&game.ruby, payer) == true, E_INSUFFICIENT_RUBY);
    let prev = table::remove(&mut game.ruby, payer);
    assert!(prev >= RUBY_ENTRY_FEE, E_INSUFFICIENT_RUBY);
    let rem = prev - RUBY_ENTRY_FEE;
    table::add(&mut game.ruby, payer, rem);

    // record
    join_round_record(picks, game, ctx);
}

// Extracts & validates the active round, checks pick-length and timing.
fun ensure_active_round(game: &Game, clock: &Clock, picks: vector<u8>) {
    assert!(option::is_some(&game.current_round), E_ROUND_NOT_ACTIVE);
    let round = option::borrow(&game.current_round);
    // let round = option::borrow_mut(&mut game.current_round);
    let now = timestamp_ms(clock);
    assert!(now >= round.start_time_ms, E_TIME_NOT_STARTED);
    assert!(now <= round.end_time_ms, E_TIME_ENDED);

    assert!(vector::length(&picks) == NUMBERS_TO_CHOOSE, E_INVALID_PICKS_LENGTH);
    let mut i = 0;
    while (i < vector::length(&picks)) {
        let pick = *vector::borrow(&picks, i);
        assert!(pick >= 1 && pick <= MAX_NUM, E_INVALID_PICKS);
        i = i + 1;
    };
}

// Shared logic for emitting the event and pushing the bet.
fun join_round_record(picks: vector<u8>, game: &mut Game, ctx: &TxContext) {
    event::emit(BetPlaced {
        round_number: game.round_number,
        player: ctx.sender(),
        picks,
    });

    let round = option::borrow_mut(&mut game.current_round);
    vector::push_back(&mut round.bets, Bet { player: ctx.sender(), picks });
}

// Public entry to end any active round and start a new one
public entry fun trigger_new_round(
    game: &mut Game,
    output: vector<u8>,
    alpha_string: vector<u8>,
    proof: vector<u8>,
    clock: &Clock,
) {
    // if there is an active round, call end_round
    if (option::is_some(&game.current_round)) {
        let round = option::borrow_mut(&mut game.current_round);
        let now = timestamp_ms(clock);
        assert!(now >= round.end_time_ms, E_TIME_ENDED);
        let vrf_pubkey = option::borrow(&game.vrf_pubkey);
        assert!(ecvrf_verify(&output, &alpha_string, vrf_pubkey, &proof), E_INVALID_PROOF);
        end_round(game, output);
    };
    start_new_round(game, clock);
}

// Internal helper to initialize or reset round in-place
fun start_new_round(game: &mut Game, clock: &Clock) {
    let start_time_ms = timestamp_ms(clock);

    let round = Round {
        start_time_ms: start_time_ms,
        end_time_ms: start_time_ms + ROUND_DURATION_MS,
        bets: vector::empty<Bet>(),
    };

    if (option::is_some(&game.current_round)) {
        game.round_number = game.round_number + 1;
    };
    option::swap_or_fill(&mut game.current_round, round);

    event::emit(RoundStarted {
        round_number: game.round_number,
        start_time: game.current_round.borrow().start_time_ms,
        end_time: game.current_round.borrow().end_time_ms,
    });
}

// Internal helper to end round and distribute prizes
fun end_round(game: &mut Game, output: vector<u8>) {
    let round = option::borrow_mut(&mut game.current_round);

    // no bets → just emit and bail
    if (vector::length(&round.bets) == 0) {
        event::emit(RoundEnded {
            round_number: game.round_number,
            winning: vector::empty<u8>(),
        });
        return
    };

    // 1) draw & record winning numbers
    let winning_numbers = generate_random_numbers(output);
    game.winning_numbers = option::some(winning_numbers);
    event::emit(RoundEnded {
        round_number: game.round_number,
        winning: winning_numbers,
    });

    // 2) bucket the winners
    let bucket_count = vector::length(&POOLS);
    let mut winners_per_bucket = vector::empty<vector<address>>();
    let mut i = 0;
    while (i < bucket_count) {
        vector::push_back(&mut winners_per_bucket, vector::empty<address>());
        i = i + 1;
    };

    let bets_ref = &round.bets;
    i = 0;
    while (i < vector::length(bets_ref)) {
        let bet = vector::borrow(bets_ref, i);
        let mut matches = 0;
        let mut j = 0;
        while (j < vector::length(&bet.picks)) {
            if (vector::contains(&winning_numbers, vector::borrow(&bet.picks, j))) {
                matches = matches + 1;
            };
            j = j + 1;
        };
        if (matches > 0) {
            let bucket = &mut winners_per_bucket[matches - 1];
            bucket.push_back(bet.player);
        };
        i = i + 1;
    };
    i = 0;
    while (i < bucket_count) {
        let total_rubies = *vector::borrow(&POOLS, i);
        let winners = &winners_per_bucket[i];
        let wcount = vector::length(winners);
        if (wcount > 0) {
            let share = total_rubies / wcount;
            let mut k = 0;
            while (k < wcount) {
                let player = *vector::borrow(winners, k);
                credit_ruby(&mut game.ruby, player, share);
                k = k + 1;
            }
        };
        i = i + 1;
    }
}

// Helper to credit ruby into the Game’s ruby table
fun credit_ruby(ruby: &mut Table<address, u64>, who: address, amount: u64) {
    if (!table::contains(ruby, who)) {
        // first time seeing this player?
        table::add(ruby, who, amount);
    } else {
        let bal_ref = table::borrow_mut(ruby, who);
        *bal_ref = *bal_ref + amount;
    }
}

// Internal helper to generate random numbers
fun generate_random_numbers(output: vector<u8>): vector<u8> {
    let mut winning_numbers = vector::empty<u8>();
    let out_len = vector::length(&output);
    let mut count = 0;
    let mut idx = 0;
    // Iterate over VRF output until we have enough unique numbers
    while (count < NUMBERS_TO_DRAW && idx < out_len) {
        let raw = *vector::borrow(&output, idx);
        let pick = raw % MAX_NUM + 1; // maps 0..(MAX_NUM-1) to 1..MAX_NUM
        if (!vector::contains(&winning_numbers, &pick)) {
            vector::push_back(&mut winning_numbers, pick);
            count = count + 1;
        };
        idx = idx + 1;
    };
    winning_numbers
}

#[test_only]
use sui::clock::{Self};
#[test_only]
use sui::coin::{mint_for_testing, zero, destroy_zero};
#[test_only]
use std::unit_test::{assert_eq};
#[test_only]
use sui::test_scenario;
#[test_only]
use sui::test_utils::destroy;

// === Test Helpers ===
#[test_only]
fun create_game(
    ctx: &mut TxContext,
    current_round: Option<Round>,
    ruby: Table<address, u64>,
): Game {
    Game {
        id: object::new(ctx),
        admin: ctx.sender(),
        vrf_pubkey: option::none(),
        round_number: 0,
        current_round,
        ruby,
        winning_numbers: option::none(),
    }
}

#[test_only]
fun create_round(start_time_ms: u64, end_time_ms: u64): Round {
    Round {
        start_time_ms: start_time_ms,
        end_time_ms: end_time_ms,
        bets: vector<Bet>[],
    }
}

// taken from https://github.com/MystenLabs/sui/blob/main/crates/sui-framework/packages/sui-framework/tests/crypto/ecvrf_tests.move
#[test_only]
fun get_test_ecvrf_values(): (vector<u8>, vector<u8>, vector<u8>, vector<u8>) {
    let output: vector<u8> =
        x"4fad431c7402fa1d4a7652e975aeb9a2b746540eca0b1b1e59c8d19c14a7701918a8249136e355455b8bc73851f7fc62c84f2e39f685b281e681043970026ed8";
    let alpha_string: vector<u8> = b"Hello, world!";
    let public_key = x"1ea6f0f467574295a2cd5d21a3fd3a712ade354d520d3bd0fe6088d7b7c2e00e";
    let proof: vector<u8> =
        x"d8ad2eafb4f2eaf317447726e541359f26dfce248431fe09984fdc73144abb6ceb006c57a29a742eae5a81dd04239870769e310a81046cbbaff8b0bd27a6d6affee167ebba50549b58ffdf9aa192f506";
    (public_key, output, alpha_string, proof)
}

#[test_only]
fun end_tests(game: Game, clock: Clock, fee: Coin<SUI>) {
    // Destroy the game
    destroy(game);

    // Destroy the clock
    clock::destroy_for_testing(clock);

    // Destroy the fee
    destroy_zero(fee);
}

#[test]
fun test_module_init() {
    let admin = @0xCAFE;

    // First transaction to emulate module initialization
    let mut scenario = test_scenario::begin(admin);
    {
        init(scenario.ctx());
    };

    // Second transaction to check if the game has been created
    scenario.next_tx(admin);
    {
        // Extract the Game object
        let game = scenario.take_shared<Game>();
        assert_eq!(game.vrf_pubkey, option::none());
        assert!(option::is_none(&game.current_round));
        destroy(game);
    };

    scenario.end();
}

// === set_vrf_key Tests ===
#[test]
fun test_set_vrf_key_succeeds_for_admin() {
    let mut ctx = tx_context::dummy();
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::none(), ruby_table);

    let key: vector<u8> = x"928744da5ffa614d65dd1d5659a8e9dd558e68f8565946ef3d54215d90cba015";
    set_vrf_key(&mut game, key, &mut ctx);

    let key_option = option::some(key);
    assert_eq!(game.vrf_pubkey, key_option);

    // Create a dummy address and transfer the game
    let dummy_address = @0xCAFE;
    transfer::public_transfer(game, dummy_address);
}

#[test, expected_failure(abort_code = E_NOT_ADMIN)]
fun test_set_vrf_key_fails_for_non_admin() {
    let mut ctx = tx_context::dummy();
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::none(), ruby_table);

    let key: vector<u8> = x"928744da5ffa614d65dd1d5659a8e9dd558e68f8565946ef3d54215d90cba015";

    let dummy_address = @0xCAFE;
    let tx_hash = x"3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532";
    let mut ctx2 = tx_context::new(dummy_address, tx_hash, 0, 0, 0);
    set_vrf_key(&mut game, key, &mut ctx2);

    transfer::public_transfer(game, dummy_address);
}

// // === join_round Tests ===
#[test, expected_failure(abort_code = E_ROUND_NOT_ACTIVE)]
fun test_join_round_fails_when_no_active_round() {
    let mut ctx = tx_context::dummy();
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::none(), ruby_table);
    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = zero(&mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_TIME_NOT_STARTED)]
fun test_join_round_fails_on_not_started() {
    let mut ctx = tx_context::dummy();
    let round = create_round(10, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = zero(&mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_TIME_ENDED)]
fun test_join_round_fails_on_ended() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = zero(&mut ctx);
    let mut clock = clock::create_for_testing(&mut ctx);

    clock::set_for_testing(&mut clock, 10);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_INVALID_PICKS_LENGTH)]
fun test_join_round_fails_on_invalid_picks_length() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3];
    let fee: Coin<SUI> = zero(&mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_INVALID_PICKS)]
fun test_join_round_fails_on_invalid_picks() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 81];
    let fee: Coin<SUI> = zero(&mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_INSUFFICIENT_FEE)]
fun test_join_round_fails_on_insufficient_fee() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = zero(&mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test]
fun test_join_round_with_sui_success() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = mint_for_testing(SUI_ENTRY_FEE, &mut ctx);
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    // Assert round values
    assert_eq!(game.winning_numbers, option::none());
    assert_eq!(game.current_round.borrow().start_time_ms, 0);
    assert_eq!(game.current_round.borrow().end_time_ms, 10);

    // Assert user bet values
    let bets_ref = &game.current_round.borrow().bets;
    assert_eq!(vector::length(bets_ref), 1);
    let bet = vector::borrow(bets_ref, 0);
    assert_eq!(bet.player, ctx.sender());
    assert_eq!(bet.picks, picks);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_INSUFFICIENT_RUBY)]
fun test_join_round_with_ruby_fails_on_not_present_in_ruby() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_ruby(picks, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = E_INSUFFICIENT_RUBY)]
fun test_join_round_with_ruby_fails_on_insufficient_ruby() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 0);

    let mut ruby_table = table::new<address, u64>(&mut ctx);
    table::add(&mut ruby_table, ctx.sender(), 10); // Only 10 ruby available
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_ruby(picks, &mut game, &clock, &mut ctx);

    end_tests(game, clock, zero(&mut ctx));
}

#[test]
fun test_join_round_with_ruby_success() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let mut ruby_table = table::new<address, u64>(&mut ctx);
    table::add(&mut ruby_table, ctx.sender(), 50);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let clock = clock::create_for_testing(&mut ctx);

    join_round_with_ruby(picks, &mut game, &clock, &mut ctx);

    // Assert round values
    assert_eq!(game.winning_numbers, option::none());
    assert_eq!(game.current_round.borrow().start_time_ms, 0);
    assert_eq!(game.current_round.borrow().end_time_ms, 10);

    // Assert user bet values
    let bets_ref = &game.current_round.borrow().bets;
    assert_eq!(vector::length(bets_ref), 1);
    let bet = vector::borrow(bets_ref, 0);
    assert_eq!(bet.player, ctx.sender());
    assert_eq!(bet.picks, picks);
    assert_eq!(get_user_ruby(&mut game, ctx.sender()), 0); // Ruby should be deducted

    end_tests(game, clock, zero(&mut ctx));
}

// === trigger_new_round Tests ===

// === no current round ===
#[test]
fun test_trigger_new_round_start_new_round() {
    let mut ctx = tx_context::dummy();
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::none(), ruby_table);

    let (public_key, output, alpha_string, proof) = get_test_ecvrf_values();
    set_vrf_key(&mut game, public_key, &mut ctx);

    let clock = clock::create_for_testing(&mut ctx);

    assert!(option::is_none(&game.current_round));

    trigger_new_round(&mut game, output, alpha_string, proof, &clock);

    assert!(option::is_some(&game.current_round));
    assert_eq!(game.round_number, 0);
    assert_eq!(game.winning_numbers, option::none());
    assert_eq!(game.current_round.borrow().start_time_ms, 0);
    assert_eq!(game.current_round.borrow().end_time_ms, ROUND_DURATION_MS);

    end_tests(game, clock, zero(&mut ctx));
}

// === with current round ===
#[test, expected_failure(abort_code = E_TIME_ENDED)]
fun test_trigger_new_round_fails_on_time_ended() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let clock = clock::create_for_testing(&mut ctx);

    trigger_new_round(&mut game, x"", x"", x"", &clock);

    end_tests(game, clock, zero(&mut ctx));
}

#[test, expected_failure(abort_code = sui::ecvrf::EInvalidProofEncoding)]
fun test_trigger_new_round_fails_on_invalid_proof() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let (public_key, output, alpha_string, _) = get_test_ecvrf_values();
    let proof = b"invalid proof";
    set_vrf_key(&mut game, public_key, &mut ctx);

    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 10);

    trigger_new_round(&mut game, output, alpha_string, proof, &clock);

    end_tests(game, clock, zero(&mut ctx));
}

#[test]
fun test_trigger_new_round_no_bets() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let (public_key, output, alpha_string, proof) = get_test_ecvrf_values();
    set_vrf_key(&mut game, public_key, &mut ctx);

    let mut clock = clock::create_for_testing(&mut ctx);
    clock::set_for_testing(&mut clock, 10);

    trigger_new_round(&mut game, output, alpha_string, proof, &clock);

    assert!(option::is_some(&game.current_round));
    assert_eq!(game.round_number, 1);
    assert_eq!(game.winning_numbers, option::none());
    assert_eq!(game.current_round.borrow().start_time_ms, 10);
    assert_eq!(game.current_round.borrow().end_time_ms, ROUND_DURATION_MS + 10);

    end_tests(game, clock, zero(&mut ctx));
}

#[test]
fun test_trigger_new_round_with_bets() {
    let mut ctx = tx_context::dummy();
    let round = create_round(0, 10);
    let ruby_table = table::new<address, u64>(&mut ctx);
    let mut game = create_game(&mut ctx, option::some(round), ruby_table);

    let (public_key, output, alpha_string, proof) = get_test_ecvrf_values();
    set_vrf_key(&mut game, public_key, &mut ctx);

    let mut clock = clock::create_for_testing(&mut ctx);
    let picks = vector<u8>[1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let fee: Coin<SUI> = mint_for_testing(SUI_ENTRY_FEE, &mut ctx);

    join_round_with_sui(picks, fee, &mut game, &clock, &mut ctx);

    clock::set_for_testing(&mut clock, 10);

    trigger_new_round(&mut game, output, alpha_string, proof, &clock);

    assert!(option::is_some(&game.current_round));
    assert_eq!(game.round_number, 1);
    assert_eq!(game.current_round.borrow().start_time_ms, 10);
    assert_eq!(game.current_round.borrow().end_time_ms, ROUND_DURATION_MS + 10);
    assert_eq!(game.current_round.borrow().bets, vector::empty<Bet>());

    let expected_numbers = vector<u8>[80, 14, 68, 29, 37, 3, 11, 30, 75, 39, 74, 38];
    assert_eq!(game.winning_numbers, option::some(expected_numbers));

    assert_eq!(get_user_ruby(&mut game, ctx.sender()), 100); // amount won by better

    end_tests(game, clock, zero(&mut ctx));
}
