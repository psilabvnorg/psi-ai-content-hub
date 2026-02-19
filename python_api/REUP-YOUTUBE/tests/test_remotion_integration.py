"""
Integration test for Remotion renderer service

This test validates:
1. Service initialization
2. Configuration validation
3. File path validation
4. Service can be imported and used correctly
"""

import sys
import logging
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from multilingual_video_pipeline.services.remotion_renderer import (
    RemotionRendererService,
    RenderConfig,
    Scene,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def test_service_initialization():
    """Test RemotionRendererService initialization"""
    print("\n📋 Test 1: Service Initialization")
    print("-" * 50)
    
    try:
        service = RemotionRendererService()
        print(f"✓ Service initialized")
        print(f"  Remotion dir: {service.remotion_dir}")
        print(f"  Render script: {service.render_script}")
        return True
    except Exception as e:
        print(f"✗ Failed: {e}")
        return False


def test_config_validation():
    """Test configuration validation"""
    print("\n📋 Test 2: Configuration Validation")
    print("-" * 50)
    
    service = RemotionRendererService()
    
    # Test: Missing scenes
    print("Testing: empty scenes list...")
    try:
        config = RenderConfig(
            scenes=[],
            audio_path='/tmp/audio.mp3',
            output_path='/tmp/output.mp4',
        )
        service._validate_config(config)
        print("✗ Should have failed on empty scenes")
        return False
    except ValueError as e:
        print(f"✓ Correctly rejected: {e}")
    
    # Test: Missing audio
    print("Testing: missing audio path...")
    try:
        config = RenderConfig(
            scenes=[Scene(image_path='/tmp/img.jpg', duration_frames=90)],
            audio_path='',
            output_path='/tmp/output.mp4',
        )
        service._validate_config(config)
        print("✗ Should have failed on missing audio")
        return False
    except ValueError as e:
        print(f"✓ Correctly rejected: {e}")
    
    print("✓ Configuration validation works correctly")
    return True


def test_scene_serialization():
    """Test Scene serialization"""
    print("\n📋 Test 3: Scene Serialization")
    print("-" * 50)
    
    scene = Scene(
        image_path='/path/to/image.jpg',
        duration_frames=90,
        transition_type='fade',
        transition_duration_frames=15,
    )
    
    scene_dict = scene.to_dict()
    print(f"Scene serialized to:")
    for key, value in scene_dict.items():
        print(f"  {key}: {value}")
    
    # Verify keys
    expected_keys = {'imagePath', 'durationFrames', 'transitionType', 'transitionDurationFrames'}
    if set(scene_dict.keys()) == expected_keys:
        print("✓ Scene serialization correct")
        return True
    else:
        print(f"✗ Missing keys: {expected_keys - set(scene_dict.keys())}")
        return False


def test_render_config_serialization():
    """Test RenderConfig serialization"""
    print("\n📋 Test 4: RenderConfig Serialization")
    print("-" * 50)
    
    config = RenderConfig(
        scenes=[
            Scene(image_path='/path/to/image1.jpg', duration_frames=90),
            Scene(image_path='/path/to/image2.jpg', duration_frames=90),
        ],
        audio_path='/path/to/audio.mp3',
        output_path='/tmp/output.mp4',
        width=1920,
        height=1080,
        fps=30,
    )
    
    config_dict = config.to_dict()
    print(f"RenderConfig keys: {list(config_dict.keys())}")
    print(f"  Scenes: {len(config_dict['scenes'])}")
    print(f"  Resolution: {config_dict['width']}x{config_dict['height']}")
    print(f"  FPS: {config_dict['fps']}")
    
    # Verify structure
    if 'scenes' in config_dict and len(config_dict['scenes']) == 2:
        print("✓ RenderConfig serialization correct")
        return True
    else:
        print("✗ RenderConfig serialization failed")
        return False


def main():
    print("\n" + "=" * 50)
    print("🧪 Remotion Renderer Service Tests")
    print("=" * 50)
    
    results = []
    
    try:
        results.append(("Initialization", test_service_initialization()))
        results.append(("Validation", test_config_validation()))
        results.append(("Scene Serialization", test_scene_serialization()))
        results.append(("Config Serialization", test_render_config_serialization()))
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Summary")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} passed")
    
    if passed == total:
        print("\n✅ All tests passed!\n")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed\n")
        return 1


if __name__ == '__main__':
    sys.exit(main())
