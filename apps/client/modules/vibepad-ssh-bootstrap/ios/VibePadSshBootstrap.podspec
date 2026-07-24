Pod::Spec.new do |s|
  s.name             = 'VibePadSshBootstrap'
  s.version          = '1.0.0'
  s.summary          = 'SSH bootstrap for VibePad Host'
  s.description      = 'Connects to a computer over SSH, installs VibePad Host, and returns its pairing invitation.'
  s.author           = 'Peacockery Studio'
  s.homepage         = 'https://peacockery.studio'
  s.platforms        = { :ios => '17.0' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  spm_dependency(
    s,
    url: 'https://github.com/orlandos-nl/Citadel',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '0.12.1' },
    products: ['Citadel']
  )

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
