<?php

namespace Tests\Feature;

use App\Models\MarkdownDocument;
use App\Models\User;
use Tests\TestCase;

class MarkdownRendererControllerTest extends TestCase
{
    public function test_markdown_page_is_public(): void
    {
        $this->withoutVite();

        $response = $this->get('/tools/markdown');

        $response->assertStatus(200);
        $response->assertSee('Markdown Renderer');
        $response->assertSee('markdown-renderer-initial-data');
    }

    public function test_anonymous_cannot_save(): void
    {
        $response = $this->postJson('/api/tools/markdown/save', [
            'title' => 'My doc',
            'markdown_content' => '# Hello',
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_save_and_public_can_view_short_code(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/markdown/save', [
            'title' => 'My doc',
            'markdown_content' => '# Hello world',
        ]);

        $response->assertCreated();
        $shortCode = $response->json('shortCode');
        $this->assertIsString($shortCode);
        $this->assertDatabaseHas('markdown_documents', [
            'user_id' => $user->id,
            'short_code' => $shortCode,
            'title' => 'My doc',
        ]);

        $view = $this->get("/tools/markdown/s/{$shortCode}");
        $view->assertOk();
        $view->assertSee($shortCode);
        $view->assertSee('Hello world');
    }

    public function test_shared_page_escapes_initial_json_script_data(): void
    {
        $this->withoutVite();
        $document = MarkdownDocument::factory()->create([
            'title' => '</script><script>alert(1)</script>',
            'short_code' => 'safemd1',
            'markdown_content' => 'hello',
        ]);

        $response = $this->get("/tools/markdown/s/{$document->short_code}");

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringNotContainsString('</script><script>alert(1)</script>', $content);
        $this->assertStringContainsString('\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E', $content);
    }

    public function test_initial_data_can_edit_flag_for_owner_and_non_owner(): void
    {
        $this->withoutVite();
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $document = MarkdownDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'edit123',
        ]);

        $ownerView = $this->actingAs($owner)->get("/tools/markdown/s/{$document->short_code}");
        $ownerView->assertOk();
        $this->assertStringContainsString('"canEdit":true', (string) $ownerView->getContent());

        $otherView = $this->actingAs($other)->get("/tools/markdown/s/{$document->short_code}");
        $otherView->assertOk();
        $this->assertStringContainsString('"canEdit":false', (string) $otherView->getContent());

        $anonymousView = $this->get("/tools/markdown/s/{$document->short_code}");
        $anonymousView->assertOk();
        $this->assertStringContainsString('"canEdit":false', (string) $anonymousView->getContent());
    }

    public function test_only_owner_can_update_saved_document(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $document = MarkdownDocument::factory()->create([
            'user_id' => $owner->id,
            'short_code' => 'upd1234',
            'markdown_content' => 'original',
        ]);

        $forbidden = $this->actingAs($other)->patchJson("/api/tools/markdown/s/{$document->short_code}", [
            'title' => 'Hijacked',
            'markdown_content' => 'pwned',
        ]);
        $forbidden->assertForbidden();

        $allowed = $this->actingAs($owner)->patchJson("/api/tools/markdown/s/{$document->short_code}", [
            'title' => 'Owner update',
            'markdown_content' => 'updated content',
        ]);
        $allowed->assertOk();

        $this->assertDatabaseHas('markdown_documents', [
            'id' => $document->id,
            'title' => 'Owner update',
            'markdown_content' => 'updated content',
        ]);
    }

    public function test_save_requires_markdown_content(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/tools/markdown/save', [
            'title' => 'No body',
            'markdown_content' => '',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['markdown_content']);
    }

    public function test_saves_generate_unique_short_codes(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/tools/markdown/save', [
            'title' => 'First',
            'markdown_content' => 'first body',
        ]);
        $second = $this->actingAs($user)->postJson('/api/tools/markdown/save', [
            'title' => 'Second',
            'markdown_content' => 'second body',
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('shortCode'), $second->json('shortCode'));
    }
}
