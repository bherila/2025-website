<?php

namespace Tests\Feature;

use App\Models\ToonDocument;
use App\Models\User;
use Tests\TestCase;

class ToonConverterControllerTest extends TestCase
{
    private function oversizedMultibyteToonContent(): string
    {
        return 'value: '.str_repeat("\u{00E9}", 2_500_001);
    }

    public function test_toon_json_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/tools/toon-json');

        $response->assertStatus(200);
        $response->assertSee('TOON');
        $response->assertSee('toon-json-initial-data');
    }

    public function test_anonymous_cannot_save(): void
    {
        $response = $this->postJson('/api/tools/toon-json/save', [
            'title' => 'My doc',
            'toon_content' => 'key: value',
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_save_valid_toon_and_public_can_view_shared_url(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'My doc',
            'toon_content' => 'greeting: hello world',
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $this->assertDatabaseHas('toon_documents', [
            'user_id' => $user->id,
            'short_code' => $shortCode,
            'title' => 'My doc',
        ]);

        $view = $this->get("/tools/toon-json/s/{$shortCode}");
        $view->assertOk();
        $view->assertSee($shortCode);
        $view->assertSee('hello world');
    }

    public function test_save_invalid_toon_returns_422(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'Bad toon',
            'toon_content' => '{{ not valid toon !!',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
    }

    public function test_save_empty_toon_content_returns_422(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'Empty',
            'toon_content' => '',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
    }

    public function test_save_over_5mb_returns_422(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'Too big',
            'toon_content' => str_repeat('a', 5_000_001),
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
    }

    public function test_save_over_5mb_multibyte_toon_returns_422_by_bytes(): void
    {
        $user = User::factory()->create();
        $toonContent = $this->oversizedMultibyteToonContent();
        $this->assertGreaterThan(5_000_000, strlen($toonContent));
        $this->assertLessThan(5_000_000, mb_strlen($toonContent));

        $response = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'Too big',
            'toon_content' => $toonContent,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
    }

    public function test_shared_page_escapes_malicious_title_in_script(): void
    {
        $this->withoutVite();
        $document = ToonDocument::factory()->create([
            'title' => '</script><script>alert(1)</script>',
            'short_code' => 'safetn1',
            'toon_content' => 'x: 1',
        ]);

        $response = $this->get("/tools/toon-json/s/{$document->short_code}");

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E', $content);
    }

    public function test_can_edit_flag_true_for_owner_false_for_others(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $document = ToonDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'edittn1',
        ]);

        $ownerView = $this->actingAs($owner)->get("/tools/toon-json/s/{$document->short_code}");
        $ownerView->assertOk();
        $this->assertStringContainsString('"canEdit":true', (string) $ownerView->getContent());

        $otherView = $this->actingAs($other)->get("/tools/toon-json/s/{$document->short_code}");
        $otherView->assertOk();
        $this->assertStringContainsString('"canEdit":false', (string) $otherView->getContent());

        $anonymousView = $this->get("/tools/toon-json/s/{$document->short_code}");
        $anonymousView->assertOk();
        $this->assertStringContainsString('"canEdit":false', (string) $anonymousView->getContent());
    }

    public function test_non_owner_patch_returns_403_and_owner_patch_succeeds(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $document = ToonDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'updtn1a',
            'toon_content' => 'original: true',
        ]);

        $forbidden = $this->actingAs($other)->patchJson("/api/tools/toon-json/s/{$document->short_code}", [
            'title' => 'Hijacked',
            'toon_content' => 'hijacked: true',
        ]);
        $forbidden->assertForbidden();

        $allowed = $this->actingAs($owner)->patchJson("/api/tools/toon-json/s/{$document->short_code}", [
            'title' => 'Owner update',
            'toon_content' => 'updated: true',
        ]);
        $allowed->assertOk();

        $this->assertDatabaseHas('toon_documents', [
            'id' => $document->id,
            'title' => 'Owner update',
            'toon_content' => 'updated: true',
        ]);
    }

    public function test_owner_patch_invalid_toon_returns_422(): void
    {
        $owner = User::factory()->create();
        $document = ToonDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'updtn2a',
            'toon_content' => 'valid: true',
        ]);

        $response = $this->actingAs($owner)->patchJson("/api/tools/toon-json/s/{$document->short_code}", [
            'title' => 'Bad',
            'toon_content' => '{{ invalid !!!',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
    }

    public function test_owner_patch_over_5mb_multibyte_toon_returns_422_by_bytes(): void
    {
        $owner = User::factory()->create();
        $document = ToonDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'updtn3a',
            'toon_content' => 'valid: true',
        ]);
        $toonContent = $this->oversizedMultibyteToonContent();
        $this->assertGreaterThan(5_000_000, strlen($toonContent));
        $this->assertLessThan(5_000_000, mb_strlen($toonContent));

        $response = $this->actingAs($owner)->patchJson("/api/tools/toon-json/s/{$document->short_code}", [
            'title' => 'Too big',
            'toon_content' => $toonContent,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['toon_content']);
        $this->assertDatabaseHas('toon_documents', [
            'id' => $document->id,
            'toon_content' => 'valid: true',
        ]);
    }

    public function test_two_saves_produce_different_short_codes(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'First',
            'toon_content' => 'a: 1',
        ]);
        $second = $this->actingAs($user)->postJson('/api/tools/toon-json/save', [
            'title' => 'Second',
            'toon_content' => 'b: 2',
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('shortCode'), $second->json('shortCode'));
    }
}
